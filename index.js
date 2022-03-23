const github = require("@actions/github");
const ado = require("azure-devops-node-api");
require("dotenv").config();

const getIssueDetails = require("./issue.js");

// Uncomment this line to verify that the environment and PATs are loaded correctly
//console.log(process.env);

// ENVIRONMENT - These constants must be defined in the environment: .env locally, or in the GitHub Action definition.
// GH_PAT: A GitHub Personal Access Token with the "repo" scope.
// GH_OWNER: The owner of the GitHub repo, ie. "champnic"
// GH_REPO: The name of the repo, ie. "Porpoise"
// ADO_PAT: An Azure DevOps Personal Access Token with the "Work Items - Read & Write" scope.
// ADO_ORG: The name of the ADO org, ie. "Microsoft"
// ADO_PROJECT: The name of the ADO project, ie. "Edge"

// CONSTANTS -----------------------

// GitHub Constants
const runningOnGitHub = !!github.context.action;
const ghToken = process.env.GH_PAT;
const ghOwner = process.env.GH_OWNER;
const ghRepo = process.env.GH_REPO;

// Ado Constants
const adoUrl = "https://dev.azure.com/" + process.env.ADO_ORG;
const adoProject = process.env.ADO_PROJECT;
const adoToken = process.env.ADO_PAT;

// Field Names
const fieldWorkItemType = "Microsoft.VSTS.CMMI.TaskType";
const fieldReproSteps = "Microsoft.VSTS.TCM.ReproSteps";
const fieldDescription = "System.Description";
const fieldCustomString3 = "Microsoft.VSTS.Common.CustomString03";

// Metric Text
const startGhMetricsTag = "------------- <b>GitHub Metrics (auto-generated)</b> -------------"
const endGhMetricsTag = "------------- <b>End GitHub Metrics</b> --------------------------"
const nl = "<br/>"

// Test issue number when running locally
const testGhId = 1;

// END CONSTANTS ----------------------

// ADO Objects
const authHandler = ado.getPersonalAccessTokenHandler(adoToken);
const adoWeb = new ado.WebApi(adoUrl, authHandler);
let adoWork = {};

// GitHub Objects
const octokit = github.getOctokit(ghToken);

/**
 * Main entry point. Called automatically at the bottom of this file.
 */
async function run() {
    console.log('Retrieving information about the GitHub issue...');
    const ghId = runningOnGitHub ? github.context.issue.number : testGhId;
    const issueDetails = await getIssueDetails(octokit, ghOwner, ghRepo, ghId);
    
    console.log('Calculating the issue score ...');
    const issueScore = await calculateGitHubIssueScore(issueDetails);
    console.log(`Metrics: ${JSON.stringify(issueDetails)} - Score: ${issueScore}`);

    console.log('Retrieving the corresponding ADO work item...');
    const adoWorkItem = await getAdoWorkItemFromIssue(issueDetails);

    if (adoWorkItem) {
        console.log(`Writing to ADO work item...`);
        await writeMetricsToAdo(adoWorkItem, issueDetails, issueScore);
    } else {
        console.log('No ADO work item found.');
    }
}

/**
 * Add the given GitHub metrics, including the resulting value, to the AzureDevOps workitem
 * with the given work item id. The result will be put into CustomString03, and the rest will
 * be added into a GitHub Metrics section in the Description or Repro Steps.
 * 
 * @param {object} adoWorkItem The ADO work item to be updated. 
 * @param {object} metrics The metrics to be updated in the work item's description.
 * @param {number} score The importance score to be added in the work item's custom string.
 */
async function writeMetricsToAdo(adoWorkItem, metrics, score) {
    const descriptionFieldName = adoWorkItem.fields[fieldWorkItemType] == "Bug"
        ? fieldReproSteps
        : fieldDescription;
    const currentDescription = adoWorkItem.fields[descriptionFieldName] ?? "";

    // Try to find an existing set of GH metrics in the description and update it.
    // If not found, add a new GH metrics section to the end of the description.
    const startIndex = currentDescription.indexOf(startGhMetricsTag);
    const endIndex = currentDescription.indexOf(endGhMetricsTag);

    let startString = currentDescription;
    let endString = "";
    if (startIndex >= 0 && endIndex >= 0) {
        startString = currentDescription.substring(0, startIndex);
        endString = currentDescription.substring(endIndex + endGhMetricsTag.length);
    } else {
        // If we haven't added metrics before, add newlines.
        startString += nl;
        endString += nl;
    }

    // TODO: Make this look nicer. Table? Can use HTML formatting.
    const metricsString = `
        <ul>
          <li><strong>Score</strong>: ${score}</li>
          <li><strong>Unique users</strong>: ${metrics.uniqueUsers}</li>
          <li><strong>Comments</strong>: ${metrics.nbComments}</li>
          <li><strong>Reactions</strong>: ${metrics.reactions.positive} 😀 / ${metrics.reactions.neutral} 😐 / ${metrics.reactions.negative} 😒</li>
          <li><strong>Reactions on comments</strong>: ${metrics.reactionsOnComments.positive} 😀 / ${metrics.reactionsOnComments.neutral} 😐 / ${metrics.reactionsOnComments.negative} 😒</li>
          <li><strong>Mentions</strong>: ${metrics.nbMentions}</li>
        </ul>
    `;

    const newDescription = startString + startGhMetricsTag + nl + metricsString + endGhMetricsTag + endString;

    // The "patchDoc" describes what fields of the workitem should be updated, and the values.
    let patchDoc = [];
    patchDoc.push({
        op: "add",
        path: "/fields/" + fieldCustomString3,
        value: "GitHub score=" + score
    });
    patchDoc.push({
        op: "add",
        path: "/fields/" + descriptionFieldName,
        value: newDescription
    });
    await adoWork.updateWorkItem([], patchDoc, adoWorkItem.id);
}

/**
 * Given the metrics for a GitHub issue, calculate the total importance score.
 * 
 * @param {Object} metrics The metrics object to calculate the score for.
 * @returns {number} The calculated score.
 */
function calculateGitHubIssueScore(metrics) {
    // FIXME: Find a better way to do this.
    let score = 0;

    // Each unique user counts as 2 points.
    score += metrics.uniqueUsers * 2;

    // Each positive reaction on the issue counts as 2 points.
    score += metrics.reactions.positive * 2;

    // But each negative reaction on the issue subtracts 2 points.
    score -= metrics.reactions.negative * 2;

    // Neutral reactions add 1 point.
    score += metrics.reactions.neutral;

    // Each positive reaction on a comment also adds 1 point.
    score += metrics.reactionsOnComments.positive;

    // Each comment counts as 2 points.
    score += metrics.nbComments * 2;

    // Mentions on this issue count as 1 point (dups and other events).
    score += metrics.nbMentions;

    return score;
}

/**
 * Given a GitHub issue, return the ADO work item that corresponds to it.
 * 
 * @param {Object} issueDetails The GitHub issue details object.
 * @returns {number} The ADO work item id of the corresponding ADO work item.
 */
async function getAdoWorkItemFromIssue(issueDetails) {
    // We expect our GitHub issues to contain the ADO number in the issue body.
    // Example: "throwing a test ado link\r\n\r\n[AB#38543568](https://microsoft.visualstudio.com/90b2a23c-cab8-4e7c-90e7-a977f32c1f5d/_workitems/edit/38543568)"

    /* Work in progress
    let ADOLink = issue.body.substring(issue.body.lastIndexOf('\r\n\r\n[AB#'));
    let ADORegExpMatch = ADOLink.match(/AB#([0-9]+)]\(https\:\/\/microsoft\.visualstudio\.com\/90b2a23c-cab8-4e7c-90e7-a977f32c1f5d\/_workitems\/edit\//);
    */

    let abIndex = issueDetails.body.lastIndexOf("AB#");
    let id = issueDetails.body.substring(abIndex + 3, abIndex + 11);

    adoWork = await adoWeb.getWorkItemTrackingApi();
    const workItem = await adoWork.getWorkItem(id);

    return workItem;
}

run();
