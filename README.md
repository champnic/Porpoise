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
   * GH_PAT="`<your gh pat>`"
   * GH_OWNER="`<gh org name for the repo>`"
   * GH_REPO="`<gh repo name>`"
   * GH_TEST_ID=`<gh issue number for local testing>`
   * ADO_PAT="`<your ado pat>`"
   * ADO_ORG="`<ado org name>`"

## Run

The script is normally run as part of a GitHub action, but you can also run it locally.

To run the script: `node index.js`.

If you only want to test the GitHub information retrieval part of the code, set `ONLY_TEST_GH` to `true` in `index.js`.

If you want to test with another GitHub repo or issue, or with another ADO org, update your `.env` file.
