// What we consider positive, and negative, reactions on GitHub comments.
const POSITIVE_REACTIONS = ["THUMBS_UP", "HEART", "HOORAY", "LAUGH", "ROCKET"];
const NEGATIVE_REACTIONS = ["CONFUSED", "THUMBS_DOWN"];

// In case no issue was passed with the action, we get a list of random issues to
// be updated. The following constants are related to this.

// Number of issues we request per page in the GitHub pagination mechanism.
const PER_PAGE = 100;
// Number of issues we want to randomly get from the list of all issues.
const NB_OF_ISSUES = 20;

/**
 * Given an issue ID, fetch all of the required information about the issue.
 * 
 * @param {Octokit} octokit The GitHub API client
 * @param {string} ghOwner The GitHub owner
 * @param {string} ghRepo The GitHub repo
 * @param {number} ghId The GitHub issue number
 * @param {Object} coefficients The coefficients used in the calculation function.
 * @returns {Object} The GitHub issue details object which includes the metrics and score.
 */
module.exports.getIssueDetails = async function (octokit, ghOwner, ghRepo, ghId, coefficients) {
  const metrics = {
    id: ghId,
    body: "",
    mentions: {},
    nbMentions: 0,
    reactions: {
      positive: 0,
      negative: 0,
      neutral: 0,
    },
    reactionsOnComments: {
      positive: 0,
      negative: 0,
      neutral: 0,
    },
    nbComments: 0,
    nbNonMemberComments: 0,
    uniqueUsers: 0,
  };

  const data = await octokit.graphql(getQuery(ghOwner, ghRepo, ghId));
  const issue = data.repository.issue;

  metrics.body = issue.body;

  const users = new Set();
  users.add(issue.author.login);

  for (const event of issue.timelineItems.nodes) {
    if (!event.type) {
      continue;
    }

    metrics.nbMentions++;

    if (!metrics.mentions[event.type]) {
      metrics.mentions[event.type] = 0;
    }
    metrics.mentions[event.type]++;

    // event.actor may be null if the user no longer has an account on GitHub (shows as "Ghost").
    // However, they were a unique user at some point so add 'null' to the set as well.
    users.add(event.actor?.login);
  }

  metrics.reactions = processReactions(issue.reactions);

  issue.comments.nodes.forEach(comment => {
    users.add(comment.author.login);

    const reactions = processReactions(comment.reactions);
    metrics.reactionsOnComments.positive += reactions.positive;
    metrics.reactionsOnComments.negative += reactions.negative;
    metrics.reactionsOnComments.neutral += reactions.neutral;

    if (comment.authorAssociation === "NONE") {
      metrics.nbNonMemberComments++;
    }
  });

  metrics.nbComments = issue.comments.nodes.length;
  metrics.uniqueUsers = users.size;

  const score = {
    value: calculateGitHubIssueScore(metrics, coefficients),
    version: coefficients.version
  };

  return { metrics, score };
}

/**
 * Given the metrics for a GitHub issue, calculate the total importance score.
 * 
 * @param {Object} metrics The metrics object to calculate the score for.
 * @param {Object} coefficients The coefficients used in the calculation function.
 * @returns {number} The calculated score.
 */
function calculateGitHubIssueScore(metrics, coefficients) {
  // The score is a linear function of the various metrics we gather for each GitHub issue.
  // The coefficients 
  let score = 
    metrics.uniqueUsers * coefficients.uniqueUsers + // 2
    metrics.reactions.positive * coefficients.posReactions + // 2
    metrics.reactions.negative * coefficients.negReactions + // -2
    metrics.reactions.neutral * coefficients.neutralReactions + // 1
    metrics.reactionsOnComments.positive * coefficients.posCommentReactions + // 1
    metrics.nbNonMemberComments * coefficients.nonMemberComments + //2
    (metrics.nbComments - metrics.nbNonMemberComments) * coefficients.memberComments + // 1
    metrics.nbMentions * coefficients.mentions; // 1

  return score;
}

function getQuery(ghOwner, ghRepo, ghId) {
  return `
  {
    repository(owner: "${ghOwner}", name: "${ghRepo}") {
      issue(number: ${ghId}) {
        title,
        body,
        author { login },
        authorAssociation,
        timelineItems(last: 200) {
          nodes {
            ... on CrossReferencedEvent {
              type: __typename,
              source {
                ... on Issue {
                  number
                }
              },
              actor { login }
            },
            ... on MarkedAsDuplicateEvent {
              type: __typename,
              actor { login }
            }
          }
        },
        reactions(last: 100) {
          nodes {
            content
          }
        },
        comments(last: 100) {
          nodes {
            author { login },
            authorAssociation,
            reactions(last: 100) {
              nodes {
                content
              }
            }
          }
        }
      }
    }
  }
  `;
}

function processReactions(reactions) {
  const processed = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };

  for (const reaction of reactions.nodes) {
    if (POSITIVE_REACTIONS.includes(reaction.content)) {
      processed.positive++;
    } else if (NEGATIVE_REACTIONS.includes(reaction.content)) {
      processed.negative++;
    } else {
      processed.neutral++;
    }
  }

  return processed;
}

module.exports.getRandomIssuesToBeUpdated = function (octokit, ghOwner, ghRepo, labels, batchLimit) {
  return octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: ghOwner,
    repo: ghRepo,
    state: "open",
    labels,
    per_page: PER_PAGE,
  }).then(issues => {
    // Only look at the ones that haven't been updated in the last day,
    // since those ones have already been handled by the GitHub Action.
    issues = issues.filter(i => new Date(i.updated_at).getTime() < yesterday().getTime());

    // Shuffle the array and get the first NB_OF_ISSUES.
    const shuffled = issues.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, batchLimit ?? NB_OF_ISSUES);

    // Process each issue.
    return selected;
  });
}

function yesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date;
}
