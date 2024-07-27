import fetch from 'node-fetch';
import { AzureCliCredential } from '@azure/identity';

const token = await initToken();

// ADO API information and client.
const ADO_ORG = process.env.ADO_ORG;
const ADO_PROJECT = process.env.ADO_PROJECT;
const ADO_AREA_PATH = process.env.ADO_AREA_PATH;
const projectUrl = "https://dev.azure.com/" + ADO_ORG + "/" + ADO_PROJECT;

// Field Names
const FIELD_WI_TYPE = "Microsoft.VSTS.CMMI.TaskType";
const FIELD_REPRO_STEPS = "Microsoft.VSTS.TCM.ReproSteps";
const FIELD_DESCRIPTION = "System.Description";
const FIELD_AREA_PATH = "System.AreaPath";
const FIELD_TITLE = "System.Title";
const FIELD_STATE = "System.State";
const FIELD_ID = "System.Id";
const FIELD_CUSTOM_STRING_3 = "Microsoft.VSTS.Common.CustomString03";

// Metric Text
const START_METRICS_TAG = "------------- <b>GitHub Metrics (auto-generated)</b> -------------";
const END_METRICS_TAG = "------------- <b>End GitHub Metrics</b> --------------------------";
const NL = "<br/>";


/**
 * Find the ADO work item that corresponds to the given GitHub issue ID and update
 * it with the given metrics and score.
 * 
 * @param {Object} metrics The GitHub issue metrics.
 * @param {Object} score The calculated score based on the metrics, including version.
 */
export async function updateWorkItemForIssue(metrics, score) {
    const adoWorkItem = await getAdoWorkItemFromIssue(metrics.body);

    if (adoWorkItem) {
        console.log(`Found work item ${adoWorkItem.id}. Updating it...`);
        await writeMetricsToAdo(adoWorkItem, metrics, score);
    }
}

/**
 * Given a GitHub issue, return the ADO work item that corresponds to it.
 * 
 * @param {string} issueBody the GitHub issue body.
 * @returns {Object} The corresponding ADO work item, if any was found.
 */
async function getAdoWorkItemFromIssue(issueBody) {
    // We expect our GitHub issues to contain the ADO number in the issue body.
    // The ADO number should be in the format "AB#12345".
    // The logic below will extract the last instance of this format in the issue body.

    const matches = issueBody.matchAll(/AB#([0-9]+)/g);
    const lastRef = [...matches].pop();
    if (!lastRef) {
        console.log("No ADO link found in issue body.");
        return null;
    }
    
    const id = lastRef[1];

    const workItem = await getWorkItem(id);

    if (!workItem) {
        console.log(`No ADO work item found for ID ${id}.`);
        return null;
    }

    return workItem;
}

/**
 * Add the given GitHub metrics and score to the provided ADO work item.
 * The score will be put into CustomString03, and the rest will
 * be added into a GitHub Metrics section in the Description or Repro Steps.
 * 
 * @param {object} adoWorkItem The ADO work item to be updated. 
 * @param {object} metrics The metrics to be updated in the work item's description.
 * @param {number} score The importance score to be added in the work item's custom string.
 */
async function writeMetricsToAdo(adoWorkItem, metrics, score) {
    const descriptionFieldName = adoWorkItem.fields[FIELD_WI_TYPE] == "Bug"
        ? FIELD_REPRO_STEPS
        : FIELD_DESCRIPTION;
    const currentDescription = adoWorkItem.fields[descriptionFieldName] ?? "";

    // Try to find an existing set of GH metrics in the description and update it.
    // If not found, add a new GH metrics section to the end of the description.
    const startIndex = currentDescription.indexOf(START_METRICS_TAG);
    const endIndex = currentDescription.indexOf(END_METRICS_TAG);

    let startString = currentDescription;
    let endString = "";
    if (startIndex >= 0 && endIndex >= 0) {
        startString = currentDescription.substring(0, startIndex);
        endString = currentDescription.substring(endIndex + END_METRICS_TAG.length);
    } else {
        // If we haven"t added metrics before, add newlines.
        startString += NL;
        endString += NL;
    }

    // TODO: Make this look nicer. Table? Can use HTML formatting.
    const metricsString = `
    <ul>
      <li><strong>GitHub ID</strong>: ${metrics.id}</li>
      <li><strong>Score</strong>: ${score.value} (Version: ${score.version})</li>
      <li><strong>Unique users</strong>: ${metrics.uniqueUsers}</li>
      <li><strong>All comments</strong>: ${metrics.nbComments}</li>
      <li><strong>Non-member comments</strong>: ${metrics.nbNonMemberComments}</li>
      <li><strong>Reactions</strong>: ${metrics.reactions.positive} 😀 / ${metrics.reactions.neutral} 😐 / ${metrics.reactions.negative} 😒</li>
      <li><strong>Reactions on comments</strong>: ${metrics.reactionsOnComments.positive} 😀 / ${metrics.reactionsOnComments.neutral} 😐 / ${metrics.reactionsOnComments.negative} 😒</li>
      <li><strong>Mentions</strong>: ${metrics.nbMentions}</li>
    </ul>
  `;

    const newDescription = startString + START_METRICS_TAG + NL + metricsString + END_METRICS_TAG + endString;
    const scoreString = score.version == 0 ?
        `GitHub score = ${score.value}` : // If we haven't specified coefficients, use the old way of displaying the string.
        `${score.value} (GitHub Score v${score.version})`;

    // The "patchDoc" describes what fields of the work item should be updated, and the values.
    const patchDoc = [];
    patchDoc.push({
        op: "add",
        path: "/fields/" + FIELD_CUSTOM_STRING_3,
        value: scoreString
    });
    patchDoc.push({
        op: "add",
        path: "/fields/" + descriptionFieldName,
        value: newDescription
    });

    await updateWorkItem(adoWorkItem.id, patchDoc);
}

/**
 * Takes an ADO work item id and attempts to find a corresponding GitHub issue
 * number using the '[GitHub #<issue>]' format in the title. If multiple issues
 * are present, it will only use the first one.
 * 
 * @param {number} adoId The ADO work item to be updated.
 * @returns {number} The corresponding GitHub issue number, if one was found, otherwise null.
 */
async function getIssueFromAdoWorkItem(adoId) {
    const workItem = await getWorkItem(adoId);
    const title = workItem.fields["System.Title"];
    
    const matches = title.matchAll(/GitHub #([0-9]+)[^0-9]/gi);
    const lastRef = [...matches].pop();
    if (!lastRef) {
        console.log(`No GitHub issue found in title for ADO ID: ${adoId} Title: ${title}`);
        return null;
    }
    
    const issue = lastRef[1];
    console.log(`Found GitHub issue: ${issue} ADO ID: ${adoId} Title: ${title}`);
    return issue;
}

/**
 * Finds all active Scenarios that need updated scores under a given area path, to make it easy to update
 * scores when looking at a particular backlog.
 * 
 * @param {string} scoreVersion The version of the scoring coefficients, to make sure we are updating only unscored items.
 * @returns {Set} The set of GitHub issues that should be handled to update the items in the given area path.
 */
export async function getIssuesFromAreaPath(scoreVersion) {
    const wiql = {
        query: `SELECT [${FIELD_ID}] FROM workitems 
            WHERE [System.TeamProject] = @project
            AND [${FIELD_AREA_PATH}] UNDER '${ADO_AREA_PATH}'
            AND [${FIELD_STATE}] IN ('Proposed','Committed','Started')
            AND [System.WorkItemType] = 'Scenario'
            AND [${FIELD_TITLE}] CONTAINS 'GitHub #'
            AND [${FIELD_CUSTOM_STRING_3}] NOT CONTAINS 'v${scoreVersion}'
            ORDER BY [${FIELD_ID}] asc`
    };
    console.log("ADO query: " + wiql.query);

    let issues = new Set();

    let queryResult = await queryByWiql(wiql);
    console.log(`Found ids: ${queryResult.workItems.map(item => item.id)}`);
    if (queryResult?.workItems.length > 0) {
        await Promise.all(queryResult.workItems.map(async workItem => {
            const issue = await getIssueFromAdoWorkItem(workItem.id);
            if (issue > 0) {
                issues.add(issue);
            }
        }));
    } else {
        console.log(`No workitems found in area path ${ADO_AREA_PATH}`);
    }
    return issues;
}

/******************************************
 * ADO REST Helpers
 ******************************************/

/**
 * @returns Token from logged in Azure CLI session (from 'az login').
 */
async function initToken() {
    // Get the Federated Credential token from az login
    console.log("Getting the Federated Credential token from az login");
    const credential = new AzureCliCredential();
    const scope = "499b84ac-1321-427f-aa17-267ca6975798/.default";
    const accessToken = await credential.getToken(scope);
    if (accessToken.token) {
        console.log("Got token from az login");
        return accessToken.token;
    }
    throw new Error("Could not get token from az login");
}

/**
 * @param {Number} adoId The ADO work item ID.
 * @returns The ADO work item object.
 */
async function getWorkItem(adoId) {
	// Make REST call to ADO workitems API
	console.log("\nStarting REST call to ADO workitems API: GET");
	const apiurl = projectUrl + "/_apis/wit/workitems/" + adoId + "?api-version=7.1";
	const response = await fetch(apiurl, {
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + token
		}
	});
	const json = await response.json();
	console.log("getWorkItem result: " + JSON.stringify(json));
	return json;
}

/**
 * @param {Number} adoId The ADO work item ID.
 * @param {Object} fields The patch document to update the work item.
 * @returns The result of the update operation.
 */
async function updateWorkItem(adoId, fields) {
	// Make REST call to ADO workitems API
	console.log("\nStarting REST call to ADO workitems API: PATCH");
	const apiurl = projectUrl + "/_apis/wit/workitems/" + adoId + "?api-version=7.1";
	const response = await fetch(apiurl, {
		method: 'PATCH',
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type': 'application/json-patch+json'
		},
		body: JSON.stringify(fields)
	});
	const json = await response.json();
	console.log("updateWorkItem result: " + JSON.stringify(json));
	return json;
}

/**
 * @param {Object} query The WIQL query object.
 * @returns The result of the query.
 */
async function queryByWiql(query) {
    // Make REST call to ADO wiql API
	const jsonQuery = JSON.stringify(query);
    console.log("\nStarting REST call to ADO wiql API");
	console.log("Wiql Query: " + jsonQuery);
    const apiurl = projectUrl + "/_apis/wit/wiql?api-version=7.1";
    const response = await fetch(apiurl, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: jsonQuery
    });
	const json = await response.json();
	console.log("Query result: " + JSON.stringify(json));
    return json;
}
