const ado = require("azure-devops-node-api");
require("dotenv").config();

// Uncomment this line to verify that the environment and PATs are loaded correctly
//console.log(process.env);

let edgeAdoUrl = "https://dev.azure.com/microsoft";
let edgeProject = "Edge";
let edgeAdoPat = process.env.EDGE_ADO_PAT;

let authHandler = ado.getPersonalAccessTokenHandler(edgeAdoPat);
let edgeAdo = new ado.WebApi(edgeAdoUrl, authHandler);

async function run() {

}

// This function is just a testbed for how the ADO API works, like what values are
// returned by Work Item Types, Bugs, all Fields, etc.
async function investigateAdoInfo() {
    let testId = 38617678;

    let adoWork = await edgeAdo.getWorkItemTrackingApi();
    let myBug = await adoWork.getWorkItem(38617678);
    //adoWork.createField()
    let bugType = await adoWork.getWorkItemType("Edge", "Bug");
    let scenarioType = await adoWork.getWorkItemType("Edge", "Scenario");

    let fields = await adoWork.getFields("Edge");
}

run();
