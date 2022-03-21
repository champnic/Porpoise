const ado = require("azure-devops-node-api");
require("dotenv").config();

// Uncomment this line to verify that the environment and PATs are loaded correctly
//console.log(process.env);

let edgeAdoUrl = "https://microsoft.visualstudio.com/Edge";
let edgeAdoPat = process.env.EDGE_ADO_PAT;

let authHandler = ado.getPersonalAccessTokenHandler(edgeAdoPat);
let edgeAdo = new ado.WebApi(edgeAdoUrl, authHandler);
