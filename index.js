const ado = require("azure-devops-node-api");
require("dotenv").config();

// Uncomment this line to verify that the environment and PATs are loaded correctly
//console.log(process.env);

let edgeAdoUrl = "https://dev.azure.com/microsoft";
let edgeProject = "Edge";
let edgeAdoPat = process.env.EDGE_ADO_PAT;

let authHandler = ado.getPersonalAccessTokenHandler(edgeAdoPat);
let edgeAdo = new ado.WebApi(edgeAdoUrl, authHandler);
//let adoWork = {};

async function run() {
    // Initialize connection to ADO work tracking.
    let adoWork = await edgeAdo.getWorkItemTrackingApi();
}

// Set the result of the calculation into custom string 3.
async function saveCalculation(adoId, result) {
    //adoWork.
}

// This function is just a testbed for how the ADO API works, like what values are
// returned by Work Item Types, Bugs, all Fields, etc.
async function investigateAdoInfo() {
    let testId = 38617678;

    let adoWork = await edgeAdo.getWorkItemTrackingApi();
    
    // Get work item
    let myBug = await adoWork.getWorkItem(testId);
    let descriptionFieldName = myBug.fields["Microsoft.VSTS.CMMI.TaskType"] == "Bug"
        ? "Microsoft.VSTS.TCM.ReproSteps"
        : "System.Description";
    let currentDescription = myBug.fields[descriptionFieldName] ?? "";

    let startTag = "<br>---- GitHub Metrics (auto-generated) ----<br>"
    let endTag = "<br>---- End GitHub Metrics ----<br>"
    let startIndex = currentDescription.indexOf(startTag);
    let endIndex = currentDescription.indexOf(endTag);

    let startString =  currentDescription;
    let endString = "";
    if (startIndex >= 0 && endIndex >= 0) {
        startString = currentDescription.substring(0, startIndex);
        endString = currentDescription.substring(endIndex + endTag.length);
    }

    let metricsString = "Likes: 10, Users: 12, Result: 101";
    let newDescription = startString + startTag + metricsString + endTag + endString;

    // Work item types
    //let bugType = await adoWork.getWorkItemType("Edge", "Bug");
    //let scenarioType = await adoWork.getWorkItemType("Edge", "Scenario");

    // All fields
    //let fields = await adoWork.getFields("Edge");

    // The "patchDoc" describes what fields of the workitem should be updated, and the values.
    let patchDoc = [];
    patchDoc.push({
        op: "add",
        path: "/fields/Microsoft.VSTS.Common.CustomString03",
        value: 100
    });
    patchDoc.push({
        op: "add",
        path: "/fields/" + descriptionFieldName,
        value: newDescription
    });
    await adoWork.updateWorkItem([], patchDoc, 38617678);
}

investigateAdoInfo();
