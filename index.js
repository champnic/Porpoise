const github = require(`@actions/github`);
const ado = require("azure-devops-node-api");
require("dotenv").config();

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
const startTag = "------------- <b>GitHub Metrics (auto-generated)</b> -------------"
const endTag = "------------- <b>End GitHub Metrics</b> --------------------------"
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
    const ghIssue = await getGitHubIssue();

    console.log('Calculating our issue metrics ...');
    const { metrics, score } = await calculateGitHubIssueMetrics(ghIssue);
    console.log(`Metrics: ${JSON.stringify(metrics)} - Score: ${score}`);

    console.log('Retrieving the corresponding ADO work item...');
    const adoId = getAdoWorkItemFromIssue(ghIssue);

    if (adoId) {
        console.log(`Writing to ADO work item ${adoId}...`);
        adoWork = await adoWeb.getWorkItemTrackingApi();
        await writeMetricsToAdo(adoId, metrics, score);
    } else {
        console.log('No ADO work item found.');
    }
}

/**
 * Retrieve the github issue.
 * Either we're running in a GitHub action and the issue is given to us by the github context.
 * Or we're running locally and we use a hard-coded issue number.
 * We also retrieve comments and other info about the issue to help calculate metrics.
 * 
 * @returns {Object} The issue object.
 */
async function getGitHubIssue() {
    let ghIssue;

    if (runningOnGitHub) {
        // Running on GitHub, get info from the context payload
        ghIssue = github.context.payload.issue;
    } else {
        // Running locally
        ghIssue = await getIssueFromRest(testGhId);
    }

    ghIssue.comments = await getCommentsFromRest(ghIssue.number);

    return ghIssue;
}

/**
 * Add the given GitHub metrics, including the resulting value, to the AzureDevOps workitem
 * with the given work item id. The result will be put into CustomString03, and the rest will
 * be added into a GitHub Metrics section in the Description or Repro Steps.
 * 
 * @param {number} workId - The ADO work item id of the item to be updated. 
 * @param {object} metrics - The metrics to be displayed in a table.
 *                           The property names are the keys and the metrics are the values.
 * @param {number} result - The result of the GH Importance calculation.
 */
async function writeMetricsToAdo(workId, metrics, result) {
    //let adoWork = await edgeAdo.getWorkItemTrackingApi();

    let myBug = await adoWork.getWorkItem(workId);
    let descriptionFieldName = myBug.fields[fieldWorkItemType] == "Bug"
        ? fieldReproSteps
        : fieldDescription;
    let currentDescription = myBug.fields[descriptionFieldName] ?? "";

    // This code will try to find an existing set of GH metrics in the description and update it.
    // If not, it will add a new GH metrics section to the end of the description.
    let startIndex = currentDescription.indexOf(startTag);
    let endIndex = currentDescription.indexOf(endTag);

    let startString = currentDescription;
    let endString = "";
    if (startIndex >= 0 && endIndex >= 0) {
        startString = currentDescription.substring(0, startIndex);
        endString = currentDescription.substring(endIndex + endTag.length);
    } else {
        // If we haven't added metrics before, add newlines.
        startString += nl;
        endString += nl;
    }

    // TODO: Make this look nicer. Table? Can use HTML formatting.
    let metricsString = "<table>";
    Object.entries(metrics).forEach(([key, value]) => {
        metricsString += "<tr><td>" + key + "</td><td>" + value + "</td></tr>";
    });
    metricsString += "</table>";

    let newDescription = startString + startTag + nl + metricsString + nl + endTag + endString;

    // The "patchDoc" describes what fields of the workitem should be updated, and the values.
    let patchDoc = [];
    patchDoc.push({
        op: "add",
        path: "/fields/" + fieldCustomString3,
        value: "GH=" + result
    });
    patchDoc.push({
        op: "add",
        path: "/fields/" + descriptionFieldName,
        value: newDescription
    });
    await adoWork.updateWorkItem([], patchDoc, workId);
}

/**
 * Calculate the metrics and total importance score for the given GitHub issue.
 * 
 * @param {Object} issue The GitHub issue object.
 * @returns {Object} The metrics and score for this issue.
 */
async function calculateGitHubIssueMetrics(issue) {
    const metrics = {
        ReactionCount: 0,
        // start with 1 because listComments does not include the main issue body
        CommentCount: 1,
        UniqueUserCount: 1
    }

    metrics.ReactionCount += issue.reactions.total_count;

    // process comments
    metrics.CommentCount += issue.comments.length;
    let uniqueUsers = new Set();
    uniqueUsers.add(issue.user.id);
    for (let comment of issue.comments) {
        uniqueUsers.add(comment.user.id);
        metrics.ReactionCount += comment.reactions.total_count;
    }
    metrics.UniqueUserCount = uniqueUsers.size;

    return { metrics, score: calculateGitHubIssueScore(metrics) };
}

/**
 * Given the metrics for a GitHub issue, calculate the total importance score.
 * 
 * @param {Object} metrics The metrics object to calculate the score for.
 * @returns {number}
 */
function calculateGitHubIssueScore(metrics) {
    // FIXME: Find a better way than just adding these numbers up.
    return metrics.ReactionCount + metrics.CommentCount + metrics.UniqueUserCount;
}

/**
 * Given a GitHub issue, return the ADO work item id that corresponds to it.
 * 
 * @param {number} issue The GitHub issue number.
 * @returns {number} The ADO work item id of the corresponding ADO work item.
 */
function getAdoWorkItemFromIssue(issue) {
    // We expect our GitHub issues to contain the ADO number in the issue body.
    // Example: "throwing a test ado link\r\n\r\n[AB#38543568](https://microsoft.visualstudio.com/90b2a23c-cab8-4e7c-90e7-a977f32c1f5d/_workitems/edit/38543568)"

    /* Work in progress
    let ADOLink = issue.body.substring(issue.body.lastIndexOf('\r\n\r\n[AB#'));
    let ADORegExpMatch = ADOLink.match(/AB#([0-9]+)]\(https\:\/\/microsoft\.visualstudio\.com\/90b2a23c-cab8-4e7c-90e7-a977f32c1f5d\/_workitems\/edit\//);
    */

    let abIndex = issue.body.lastIndexOf("AB#");
    let adoId = issue.body.substring(abIndex + 3, abIndex + 11);
    return adoId;
}

/**
 * Given an issue number, return the issue object from the GitHub API.
 * 
 * @param {number} ghId The GitHub issue number.
 * @returns {Object} The GitHub issue object
 */
async function getIssueFromRest(ghId) {
    const requestParam = {
        owner: ghOwner,
        repo: ghRepo,
        issue_number: ghId,
    };

    const { data: issue } = await octokit.rest.issues.get(requestParam);
    return issue;
}

/**
 * Given an issue number, return the comments on the issue from the GitHub API.
 * @param {number} ghId The GitHub issue number.
 * @returns {Array} The list of comments.
 */
async function getCommentsFromRest(ghId) {
    const requestParam = {
        owner: ghOwner,
        repo: ghRepo,
        issue_number: ghId,
    };

    const { data: comments } = await octokit.rest.issues.listComments(requestParam);
    return comments;
}

run();
