const ado = require("azure-devops-node-api");
require("dotenv").config();

// Uncomment this line to verify that the environment and PATs are loaded correctly
//console.log(process.env);


// CONSTANTS
// Ado Constants
const edgeAdoUrl = "https://dev.azure.com/microsoft";
const edgeProject = "Edge";
const edgeAdoPat = process.env.EDGE_ADO_PAT;

// Field Names
const fieldWorkItemType = "Microsoft.VSTS.CMMI.TaskType";
const fieldReproSteps = "Microsoft.VSTS.TCM.ReproSteps";
const fieldDescription = "System.Description";
const fieldCustomString3 = "Microsoft.VSTS.Common.CustomString03";

// Metric Text
const startTag = "---- GitHub Metrics (auto-generated) ----"
const endTag = "---- End GitHub Metrics ----"
const nl = "<br/>"

// END CONSTANTS

let authHandler = ado.getPersonalAccessTokenHandler(edgeAdoPat);
let edgeAdo = new ado.WebApi(edgeAdoUrl, authHandler);
let adoWork = {};

async function run() {
    // Initialize connection to ADO work tracking.
    adoWork = await edgeAdo.getWorkItemTrackingApi();

    // Uncomment this line to test the metrics updating
    //writeMetricsToAdo(38617678, 12, 3, 14, 27);
}

/**
 * Add the given GitHub metrics, including the resulting value, to the AzureDevOps workitem
 * with the given work item id. The result will be put into CustomString03, and the rest will
 * be added into a GitHub Metrics section in the Description or Repro Steps.
 * 
 * @param {number} workId - The ADO work item id of the item to be updated. 
 * @param {number} reactions - The number of positive reactions to the GH issue.
 * @param {number} users - The number of unique non-Edge devs responding to a GH issue.
 * @param {number} comments - The number of comments on a GH issue.
 * @param {number} result - The result of the GH Importance calculation.
 */
async function writeMetricsToAdo(workId, reactions, users, comments, result) {
    let adoWork = await edgeAdo.getWorkItemTrackingApi();

    let myBug = await adoWork.getWorkItem(workId);
    let descriptionFieldName = myBug.fields[fieldWorkItemType] == "Bug"
        ? fieldReproSteps
        : fieldDescription;
    let currentDescription = myBug.fields[descriptionFieldName] ?? "";

    // This code will try to find an existing set of GH metrics in the description and update it.
    // If not, it will add a new GH metrics section to the end of the description.
    let startIndex = currentDescription.indexOf(startTag);
    let endIndex = currentDescription.indexOf(endTag);

    let startString =  currentDescription;
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
    let metricsString = "Reactions: " + reactions + nl +
        "UniqueUsers: " + users + nl +
        "Comments: " + comments;

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

// This function is just a testbed for how the ADO API works, like what values are
// returned by Work Item Types, Bugs, all Fields, etc.
async function testAdo() {
    let testId = 38617678;
    let adoWork = await edgeAdo.getWorkItemTrackingApi();

    let myBug = await adoWork.getWorkItem(testId);
    // Work item types
    //let bugType = await adoWork.getWorkItemType("Edge", "Bug");
    //let scenarioType = await adoWork.getWorkItemType("Edge", "Scenario");

    // All fields
    //let fields = await adoWork.getFields("Edge");
}

run();
