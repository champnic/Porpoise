require("dotenv").config();
const { graphql } = require("@octokit/graphql");

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${process.env.EDGE_GH_PAT}`,
  },
});

const POSITIVE_REACTIONS = ['THUMBS_UP', 'HEART', 'HOORAY', 'LAUGH', 'ROCKET'];
const NEGATIVE_REACTIONS = ['CONFUSED', 'THUMBS_DOWN'];

function processReactions(reactions) {
  const processed = {
    positive: 0,
    negative: 0
  };

  for (const reaction of reactions.nodes) {
    if (POSITIVE_REACTIONS.includes(reaction.content)) {
      processed.positive++;
    } else if (NEGATIVE_REACTIONS.includes(reaction.content)) {
      processed.negative++;
    }
  }

  return processed;
}

graphqlWithAuth(`
{
  repository(owner: "MicrosoftEdge", name: "WebView2Feedback") {
    issue(number: ${parseInt(process.argv[2], 10)}) {
      title,
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
`).then(data => {
  const issue = data.repository.issue;
  const report = {
    mentions: {},
  };
  
  for (const event of issue.timelineItems.nodes) {
    if (!event.type) {
      continue;
    }

    if (!report.mentions[event.type]) {
      report.mentions[event.type] = 0;
    }
    report.mentions[event.type] ++;
  }
  
  report.reactions = processReactions(issue.reactions);
  
  report.comments = issue.comments.nodes.filter(comment => {
    return comment.authorAssociation !== 'MEMBER';
  }).map(comment => {
    return processReactions(comment.reactions);
  });

  report.nbComments = report.comments.length;

  console.log(report);
});
