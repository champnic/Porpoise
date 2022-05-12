// This is the main entry point for the GitHub Action.
//
// This is normally run by a GitHub action triggered on 2 possible things:
//  1. When a GitHub issue changes: that particular issue is then used to update the
//     corresponding ADO work item.
//  2. When the action is run on a schedule (or manually): a list of random issues is
//     retrieved and their corresponding ADO work items are updated.
//     This is because new reactions do not cause issue changes, so #1 can't pick up
//     all changes we care about.
//
// This can also be run locally for testing purposes, by using GH_TEST_ID.
// Either set it to the number of the issue you want to process. Or omit it to test
// retrieving random issues.
//
// ENVIRONMENT
//
// These constants must be defined in the environment:
// - either in .env locally,
// - or in the GitHub Action definition.
//
// GH_PAT: A GitHub Personal Access Token with the "repo" scope.
// GH_OWNER: The owner of the GitHub repo, ie. "MicrosoftEdge"
// GH_REPO: The name of the repo, ie. "WebView2Feedback"
// GH_TEST_ID: An issue number to be used when testing locally. Omit to test retrieving a list
//             of random issues to update.
// GH_TRACKED_LABELS: A list of labels that we use to know which issues are considered tracked.
// ADO_PAT: An Azure DevOps Personal Access Token with the "Work Items - Read & Write" scope.
// ADO_ORG: The name of the ADO org, ie. "Microsoft"

require("dotenv").config();

const github = require("@actions/github");
const ado = require("azure-devops-node-api");
const { getIssueDetails, getRandomIssuesToBeUpdated } = require("./gh.js");
const { updateWorkItemForIssue } = require("./ado.js");

// GitHub API information and client.
const GH_PAT = process.env.GH_PAT;
const GH_OWNER = process.env.GH_OWNER;
const GH_REPO = process.env.GH_REPO;
const GH_TRACKED_LABELS = process.env.GH_TRACKED_LABELS;

const octokit = github.getOctokit(GH_PAT);

// ADO API information and client.
const ADO_URL = `https://dev.azure.com/${process.env.ADO_ORG}`;
const ADO_PAT = process.env.ADO_PAT;

const adoClient = new ado.WebApi(ADO_URL, ado.getPersonalAccessTokenHandler(ADO_PAT));

// Set to true if you want to only test the GitHub API part, but not write to ADO.
const ONLY_TEST_GH = false;

// Detect if we're running as part of the action, and if we've been given an issue payload.
const IS_ACTION = !!github.context.action;
const IS_ISSUE_UPDATED_ACTION = IS_ACTION && github.context.issue;
const GH_ID = IS_ACTION && IS_ISSUE_UPDATED_ACTION ? github.context.issue.number : process.env.GH_TEST_ID;

const GH_SCORE_COEFFS = {
    version: process.env.COEFF_VERSION ?? 0,
    uniqueUsers: process.env.COEFF_UNIQUE_USERS ?? 2,
    posReactions: process.env.COEFF_POS_REACTIONS ?? 2,
    negReactions: process.env.COEFF_NEG_REACTIONS ?? -2,
    neutralReactions: process.env.COEFF_NEUTRAL_REACTIONS ?? 1,
    posCommentReactions: process.env.COEFF_POS_COMMENT_REACTIONS ?? 1,
    nonMemberComments: process.env.COEFF_NON_MEMBER_COMMENTS ?? 2,
    memberComments: process.env.COEFF_MEMBER_COMMENTS ?? 1,
    mentions: process.env.COEFF_MENTIONS ?? 1
};

async function run() {
    if (GH_ID) {
        console.log(`GitHub issue ${GH_ID} was provided, handling just this one.`);
        await handleOneIssue(GH_ID);
    } else {
        console.log("No GitHub issue was provided, getting a random list...");
        const issues = await getRandomIssuesToBeUpdated(octokit, GH_OWNER, GH_REPO, GH_TRACKED_LABELS);
        for (const issue of issues) {
            console.log(`Found issue ${issue.number}, handling it now.`);
            await handleOneIssue(issue.number);
        }
    }
}

async function handleOneIssue(ghId) {
    console.log(`Retrieving metrics about issue ${ghId} and calculating a score...`);
    const { metrics, score } = await getIssueDetails(octokit, GH_OWNER, GH_REPO, ghId, GH_SCORE_COEFFS);

    console.log(`Metrics: ${formatMetrics(metrics)} - Score: ${score.value} - Version: ${score.version}`);

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
