const POSITIVE_REACTIONS = ["THUMBS_UP", "HEART", "HOORAY", "LAUGH", "ROCKET"];
const NEGATIVE_REACTIONS = ["CONFUSED", "THUMBS_DOWN"];

/**
 * Given an issue ID, fetch all of the required information about the issue.
 * 
 * @param {Octokit} octokit The GitHub API client
 * @param {string} ghOwner The GitHub owner
 * @param {string} ghRepo The GitHub repo
 * @param {number} ghId The GitHub issue number
 * @returns {Object} The GitHub issue details object
 */
module.exports.getIssueDetails = async function (octokit, ghOwner, ghRepo, ghId) {
    const details = {
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

    details.body = issue.body;

    const users = new Set();
    users.add(issue.author.login);

    for (const event of issue.timelineItems.nodes) {
        if (!event.type) {
            continue;
        }

        details.nbMentions++;

        if (!details.mentions[event.type]) {
            details.mentions[event.type] = 0;
        }
        details.mentions[event.type]++;

        users.add(event.actor.login);
    }

    details.reactions = processReactions(issue.reactions);

    issue.comments.nodes.forEach(comment => {
        users.add(comment.author.login);

        const reactions = processReactions(comment.reactions);
        details.reactionsOnComments.positive += reactions.positive;
        details.reactionsOnComments.negative += reactions.negative;
        details.reactionsOnComments.neutral += reactions.neutral;

        if (comment.authorAssociation === "NONE") {
            details.nbNonMemberComments++;
        }
    });

    details.nbComments = issue.comments.nodes.length;
    details.uniqueUsers = users.size;

    const score = calculateGitHubIssueScore(details);

    return { details, score };
}

/**
 * Given the metrics for a GitHub issue, calculate the total importance score.
 * 
 * @param {Object} metrics The metrics object to calculate the score for.
 * @returns {number} The calculated score.
 */
function calculateGitHubIssueScore(metrics) {
    // FIXME: Find a better way to do this.
    let score = 0;

    // Each unique user counts as 2 points.
    score += metrics.uniqueUsers * 2;

    // Each positive reaction on the issue counts as 2 points.
    score += metrics.reactions.positive * 2;

    // But each negative reaction on the issue subtracts 2 points.
    score -= metrics.reactions.negative * 2;

    // Neutral reactions add 1 point.
    score += metrics.reactions.neutral;

    // Each positive reaction on a comment also adds 1 point.
    score += metrics.reactionsOnComments.positive;

    // Each non-member comment counts as 2 points, and member comment as 1.
    score += metrics.nbComments - metrics.nbNonMemberComments;
    score += metrics.nbNonMemberComments * 2;

    // Mentions on this issue count as 1 point (dups and other events).
    score += metrics.nbMentions;

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
