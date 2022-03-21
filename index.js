import * as ado from "azure-devopes-node-api";

require('dotenv').config();
console.log(process.env);

let edgeAdoUrl = "https://microsoft.visualstudio.com/Edge";
let edgeAdoPat = process.env.EDGE_ADO_PAT;

let authHandler = ado.GetPersonalAccessTokenHandler(edgeAdoPAT);
let edgeAdo = new ado.WebApi(edgeAdoUrl, authHandler);