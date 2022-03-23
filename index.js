const github = require(`@actions/github`);
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
const startTag = "------------- <b>GitHub Metrics (auto-generated)</b> -------------"
const endTag =   "------------- <b>End GitHub Metrics</b> --------------------------"
const nl = "<br/>"

// END CONSTANTS

let authHandler = ado.getPersonalAccessTokenHandler(edgeAdoPat);
let edgeAdo = new ado.WebApi(edgeAdoUrl, authHandler);
let adoWork = {};

async function run() {
    const context = github.context;
    const env = process.env;
    let vm = getValuesFromPayload(github.context.payload, env);
    const metrics = await calculateIssueMetrics(vm);
    console.log("Metrics: " + JSON.stringify(metrics));

    // Initialize connection to ADO work tracking.
    adoWork = await edgeAdo.getWorkItemTrackingApi();

    // Uncomment this line to test the metrics updating
    //writeMetricsToAdo(38617678, {"Reactions": 12, "Users": 4, "Messages": 20}, 27);
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
    let metricsString = "<table>";
    Object.entries(metrics).forEach(([key, value]) => {
        metricsString += "<tr><td>"+key+"</td><td>"+value+"</td></tr>";
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

// todo - add JSDoc
async function calculateIssueMetrics(vm) {
	let metrics = {
		uniqueUsers: new Set(),
		reactionCount: 0,
		commentCount: 1,		// start wiith 1 because listComments does not include the first issue post
		ADONumber: undefined,	// ADO work item # or undefined of not found
		get uniqueUserCount() {return this.uniqueUsers.size} 
	}
	const octokit = github.getOctokit(vm.env.ghToken);

	// process the issue body
	const { data: issue } = await octokit.rest.issues.get({
		owner: vm.owner,
		repo: vm.repository,
		issue_number: vm.number,
	});
	metrics.uniqueUsers.add(issue.user.id);
	metrics.reactionCount += issue.reactions.total_count;
	// example issue body: "throwing a test ado link\r\n\r\n[AB#38543568](https://microsoft.visualstudio.com/90b2a23c-cab8-4e7c-90e7-a977f32c1f5d/_workitems/edit/38543568)
	let ADOLink = issue.body.substring(issue.body.lastIndexOf('\r\n\r\n[AB#'));
	let ADORegExpMatch = ADOLink.match(/AB#([0-9]+)]\(https\:\/\/microsoft\.visualstudio\.com\/90b2a23c-cab8-4e7c-90e7-a977f32c1f5d\/_workitems\/edit\//);
	metrics.ADONumber = ADORegExpMatch ? ADORegExpMatch[1] : undefined;

	// process comments
	const { data: comments } = await octokit.rest.issues.listComments({
		owner: vm.owner,
		repo: vm.repository,
		issue_number: vm.number,
	});
	metrics.commentCount += comments.length;
	for (let comment of comments) {
		metrics.uniqueUsers.add(comment.user.id);
		metrics.reactionCount += comment.reactions.total_count;
	}
	return metrics;
}

// get object values from the payload that will be used for logic, updates, finds, and creates
function getValuesFromPayload(payload, env) {
	// prettier-ignore
	var vm = {
		action: payload.action != undefined ? payload.action : "",
		url: payload.issue.html_url != undefined ? payload.issue.html_url : "",
		number: payload.issue.number != undefined ? payload.issue.number : -1,
		title: payload.issue.title != undefined ? payload.issue.title : "",
		state: payload.issue.state != undefined ? payload.issue.state : "",
		user: payload.issue.user.login != undefined ? payload.issue.user.login : "",
		body: payload.issue.body != undefined ? payload.issue.body : "",
		repo_fullname: payload.repository.full_name != undefined ? payload.repository.full_name : "",
		repo_name: payload.repository.name != undefined ? payload.repository.name : "",
		repo_url: payload.repository.html_url != undefined ? payload.repository.html_url : "",
		closed_at: payload.issue.closed_at != undefined ? payload.issue.closed_at : null,
		owner: payload.repository.owner != undefined ? payload.repository.owner.login : "",
		label: "",
		comment_text: "",
		comment_url: "",
		organization: "",
		repository: "",
		env: {
			organization: env.ado_organization != undefined ? env.ado_organization : "",
			orgUrl: env.ado_organization != undefined ? "https://dev.azure.com/" + env.ado_organization : "",
			adoToken: env.ado_token != undefined ? env.ado_token : "",
			ghToken: env.github_token != undefined ? env.github_token : "",
			project: env.ado_project != undefined ? env.ado_project : "",
			areaPath: env.ado_area_path != undefined ? env.ado_area_path : "",
			wit: env.ado_wit != undefined ? env.ado_wit : "Bug",
			tags: env.ado_tags != undefined ? env.ado_tags : "",
			setLabelsAsTags: env.ado_set_labels != undefined ? env.ado_set_labels : true,
			closedState: env.ado_close_state != undefined ? env.ado_close_state : "Closed",
			newState: env.ado_new_state != undefined ? env.ado_new_State : "Active",
			bypassRules: env.ado_bypassrules != undefined ? env.ado_bypassrules : false,
			createOnTagging: env.create_on_tagging != undefined ? env.create_on_tagging : false,
			tagOnClose: env.ado_tag_on_close != undefined ? env.ado_tag_on_close : ""
		}
	};

	// label is not always part of the payload
	if (payload.label != undefined) {
		vm.label = payload.label.name != undefined ? payload.label.name : "";
	}

	// comments are not always part of the payload
	// prettier-ignore
	if (payload.comment != undefined) {
		vm.comment_text = payload.comment.body != undefined ? payload.comment.body : "";
		vm.comment_url = payload.comment.html_url != undefined ? payload.comment.html_url : "";
	}

	// split repo full name to get the org and repository names
	if (vm.repo_fullname != "") {
		var split = payload.repository.full_name.split("/");
		vm.organization = split[0] != undefined ? split[0] : "";
		vm.repository = split[1] != undefined ? split[1] : "";
	}

	return vm;
}

run();
