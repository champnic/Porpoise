// Field Names
const FIELD_WI_TYPE = "Microsoft.VSTS.CMMI.TaskType";
const FIELD_REPRO_STEPS = "Microsoft.VSTS.TCM.ReproSteps";
const FIELD_DESCRIPTION = "System.Description";
const FIELD_CUSTOM_STRING_3 = "Microsoft.VSTS.Common.CustomString03";

// Metric Text
const START_METRICS_TAG = "------------- <b>GitHub Metrics (auto-generated)</b> -------------";
const END_METRICS_TAG = "------------- <b>End GitHub Metrics</b> --------------------------";
const NL = "<br/>";

/**
 * Find the ADO work item that corresponds to the given GitHub issue ID and update
 * it with the given metrics and score.
 * 
 * @param {Object} adoClient The ADO API client object.
 * @param {Object} metrics The GitHub issue metrics.
 * @param {Object} score The calculated score based on the metrics, including version.
 */
module.exports.updateWorkItemForIssue = async function (adoClient, metrics, score) {
    const adoWorkItem = await getAdoWorkItemFromIssue(adoClient, metrics.body);

    if (adoWorkItem) {
        console.log(`Found work item ${adoWorkItem.id}. Updating it...`);
        await writeMetricsToAdo(adoClient, adoWorkItem, metrics, score);
    }
}

/**
 * Given a GitHub issue, return the ADO work item that corresponds to it.
 * 
 * @param {Object} adoClient The ADO API client object.
 * @param {string} issueBody the GitHub issue body.
 * @returns {Object} The corresponding ADO work item, if any was found.
 */
async function getAdoWorkItemFromIssue(adoClient, issueBody) {
    // We expect our GitHub issues to contain the ADO number in the issue body.
    // The ADO number should be in the format "AB#12345".
    // The logic below will extract the last instance of this format in the issue body.

    const matches = issueBody.matchAll(/AB#([0-9]+)/g);
    const lastRef = [...matches].pop();
    if (!lastRef) {
        console.log("No ADO link found in issue body.");
        return null;
    }
    
    const id = lastRef[1];

    const adoWIT = await adoClient.getWorkItemTrackingApi();
    const workItem = await adoWIT.getWorkItem(id);

    if (!workItem) {
        console.log(`No ADO work item found for ID ${id}.`);
        return null;
    }

    return workItem;
}

/**
 * Add the given GitHub metrics and score to the provided ADO work item.
 * The score will be put into CustomString03, and the rest will
 * be added into a GitHub Metrics section in the Description or Repro Steps.
 * 
 * @param {Object} adoClient The ADO API client object.
 * @param {object} adoWorkItem The ADO work item to be updated. 
 * @param {object} metrics The metrics to be updated in the work item's description.
 * @param {number} score The importance score to be added in the work item's custom string.
 */
async function writeMetricsToAdo(adoClient, adoWorkItem, metrics, score) {
    const descriptionFieldName = adoWorkItem.fields[FIELD_WI_TYPE] == "Bug"
        ? FIELD_REPRO_STEPS
        : FIELD_DESCRIPTION;
    const currentDescription = adoWorkItem.fields[descriptionFieldName] ?? "";

    // Try to find an existing set of GH metrics in the description and update it.
    // If not found, add a new GH metrics section to the end of the description.
    const startIndex = currentDescription.indexOf(START_METRICS_TAG);
    const endIndex = currentDescription.indexOf(END_METRICS_TAG);

    let startString = currentDescription;
    let endString = "";
    if (startIndex >= 0 && endIndex >= 0) {
        startString = currentDescription.substring(0, startIndex);
        endString = currentDescription.substring(endIndex + END_METRICS_TAG.length);
    } else {
        // If we haven"t added metrics before, add newlines.
        startString += NL;
        endString += NL;
    }

    // TODO: Make this look nicer. Table? Can use HTML formatting.
    const metricsString = `
    <ul>
      <li><strong>Score</strong>: ${score.value} (Version: ${score.version})</li>
      <li><strong>Unique users</strong>: ${metrics.uniqueUsers}</li>
      <li><strong>All comments</strong>: ${metrics.nbComments}</li>
      <li><strong>Non-member comments</strong>: ${metrics.nbNonMemberComments}</li>
      <li><strong>Reactions</strong>: ${metrics.reactions.positive} 😀 / ${metrics.reactions.neutral} 😐 / ${metrics.reactions.negative} 😒</li>
      <li><strong>Reactions on comments</strong>: ${metrics.reactionsOnComments.positive} 😀 / ${metrics.reactionsOnComments.neutral} 😐 / ${metrics.reactionsOnComments.negative} 😒</li>
      <li><strong>Mentions</strong>: ${metrics.nbMentions}</li>
    </ul>
  `;

    const newDescription = startString + START_METRICS_TAG + NL + metricsString + END_METRICS_TAG + endString;
    const scoreString = score.version == 0 ?
        `GitHub score = ${score.value}` : // If we haven't specified coefficients, use the old way of displaying the string.
        `${score.value} (GitHub Score v${score.version})`;

    // The "patchDoc" describes what fields of the work item should be updated, and the values.
    const patchDoc = [];
    patchDoc.push({
        op: "add",
        path: "/fields/" + FIELD_CUSTOM_STRING_3,
        value: scoreString
    });
    patchDoc.push({
        op: "add",
        path: "/fields/" + descriptionFieldName,
        value: newDescription
    });

    const adoWIT = await adoClient.getWorkItemTrackingApi();
    await adoWIT.updateWorkItem([], patchDoc, adoWorkItem.id);
}
