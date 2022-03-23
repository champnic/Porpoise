const POSITIVE_REACTIONS = ['THUMBS_UP', 'HEART', 'HOORAY', 'LAUGH', 'ROCKET'];
const NEGATIVE_REACTIONS = ['CONFUSED', 'THUMBS_DOWN'];

/**
 * Given an issue ID, fetch all of the required information about the issue.
 * 
 * @param {Octokit} octokit The GitHub API client
 * @param {string} ghOwner The GitHub owner
 * @param {string} ghRepo The GitHub repo
 * @param {number} ghId The GitHub issue number
 * @returns {Object} The GitHub issue details object
 */
module.exports = async function getIssueDetails(octokit, ghOwner, ghRepo, ghId) {
  const report = {
    id: ghId,
    body: '',
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
    uniqueUsers: 0,
  };

  const data = await octokit.graphql(getQuery(ghOwner, ghRepo, ghId));
  const issue = data.repository.issue;

  report.body = issue.body;
  
  const users = new Set();
  users.add(issue.author.login);
  
  for (const event of issue.timelineItems.nodes) {
    if (!event.type) {
      continue;
    }

    report.nbMentions++;

    if (!report.mentions[event.type]) {
      report.mentions[event.type] = 0;
    }
    report.mentions[event.type] ++;

    users.add(event.actor.login);
  }
  
  report.reactions = processReactions(issue.reactions);
  
  issue.comments.nodes.forEach(comment => {
    users.add(comment.author.login);
    
    const reactions = processReactions(comment.reactions);
    report.reactionsOnComments.positive += reactions.positive;
    report.reactionsOnComments.negative += reactions.negative;
    report.reactionsOnComments.neutral += reactions.neutral;
  });

  report.nbComments = issue.comments.nodes.length;
  report.uniqueUsers = users.size;

  return report;
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
