const github = require("@actions/github");
const ado = require("azure-devops-node-api");
require("dotenv").config();

const { getIssueDetails } = require("./gh.js");
const { updateWorkItemForIssue } = require("./ado.js");

// Uncomment this line to verify that the environment and PATs are loaded correctly
// console.log(process.env);

// ENVIRONMENT
//
// These constants must be defined in the environment:
// - either in .env locally,
// - or in the GitHub Action definition.
//
// GH_PAT: A GitHub Personal Access Token with the "repo" scope.
// GH_OWNER: The owner of the GitHub repo, ie. "MicrosoftEdge"
// GH_REPO: The name of the repo, ie. "WebView2Feedback"
// GH_TEST_ID: An issue number to be used when testing locally.
// ADO_PAT: An Azure DevOps Personal Access Token with the "Work Items - Read & Write" scope.
// ADO_ORG: The name of the ADO org, ie. "Microsoft"

const isGitHubAction = !!github.context.action;

// GitHub API information and client.
const GH_PAT = process.env.GH_PAT;
const GH_OWNER = process.env.GH_OWNER;
const GH_REPO = process.env.GH_REPO;

const octokit = github.getOctokit(GH_PAT);

// ADO API information and client.
const ADO_URL = `https://dev.azure.com/${process.env.ADO_ORG}`;
const ADO_PAT = process.env.ADO_PAT;

const adoClient = new ado.WebApi(ADO_URL, ado.getPersonalAccessTokenHandler(ADO_PAT));

// Test issue number when running locally
const GH_TEST_ID = process.env.GH_TEST_ID || 1;
// Set to true if you want to only test the GitHub API part, but not write to ADO.
const ONLY_TEST_GH = false;

async function run() {
    const ghId = isGitHubAction ? github.context.issue.number : GH_TEST_ID;

    console.log(`Retrieving metrics about issue ${ghId} and calculating a score...`);
    const { metrics, score } = await getIssueDetails(octokit, GH_OWNER, GH_REPO, ghId);

    console.log(`Metrics: ${formatMetrics(metrics)} - Score: ${score}`);

    if (ONLY_TEST_GH) {
        return;
    }

    console.log("Retrieving the corresponding ADO work item and updating it...");
    await updateWorkItemForIssue(adoClient, metrics, score);
}

function formatMetrics(metrics) {
    return JSON.stringify(metrics, (key, value) => key === 'body' ? undefined : value);
}

run().then(() => {
    console.log("Done!")
}).catch(e => {
    console.error("Error", e);
});
