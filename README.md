# Porpoise

## Setup

1. Clone repo: `git clone https://github.com/champnic/Porpoise.git`
1. Install Node: `https://nodejs.org/en/download/`
1. Install dependencies: `npm install`

## Local environment setup

1. Create a GitHub Personal Access Token with the "repo" scope
1. Create an ADO Personal Access Token with the "Work Items - Read & Write" scope
1. Create an environment file for testing locally: `.env` (**do not check this file in**).
1. Fill in the file as follows
   * GH_PAT="`<your gh PAT>`"
   * GH_OWNER="`<gh org name for the repo>`"
   * GH_REPO="`<gh repo name>`"
   * GH_TEST_ID=`<gh issue number for local testing - omit to test retrieving a list of random issues to update>`
   * GH_TRACKED_LABELS="`<comma-separated list of labels to find tracked issues>`"
   * ADO_PAT="`<your ado PAT>`"
   * ADO_ORG="`<ado org name>`"
1. (OPTIONAL) If you'd like to change the function that calculates a score based on the GitHub Metrics, add the following to the `.env` file:
   * COEFF_VERSION="`<score version for your tracking>`"
   * COEFF_UNIQUE_USERS="`<coefficient of unique user count>`"
   * COEFF_POS_REACTIONS="`<coefficient of positive reaction count>`"
   * COEFF_NEG_REACTIONS="`<coefficient of negative reaction count (often negative value)>`"
   * COEFF_NEUTRAL_REACTIONS="`<coefficient of neutral reaction count>`"
   * COEFF_POS_COMMENT_REACTIONS="`<coefficient of positive comment reaction count>`"
   * COEFF_NON_MEMBER_COMMENTS="`<coefficient of non-repo-members comment count>`"
   * COEFF_MEMBER_COMMENTS="`<coefficient of repo members comment count>`"
   * COEFF_MENTIONS="`<coefficient of other issue mention count>`"

## Run

The script is normally run as part of a GitHub action, but you can also run it locally.

To run the script: `node index.js`.

If you only want to test the GitHub information retrieval part of the code, set `ONLY_TEST_GH` to `true` in `index.js`.

If you want to test with another GitHub repo or issue, or with another ADO org, update your `.env` file.

## Metric Scoring

The metric scoring function is a linear combination of the various metrics. To change the calculation you can specify
different coefficients for each metric. The coefficient is multiplied by the metric value, and then these are added
together to create a final score. You can also specify a "version" for your set of coefficients which will be added
along with the score value in the ADO item, so that you can compare different scores across items and know whether they
used the same coefficients.
