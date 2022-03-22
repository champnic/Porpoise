# GraphQL test

This is just a quick test to show how we could use the GraphQL end point to gather metrics about github issues.

How to:

* Create a token on GitHub with the the `repo` access right.
* Create a `.env` file in the root folder and add `EDGE_GH_PAT="<token>"` in it.
* `npm install`
* `node graphql-test 348` (or any other issue number).

This will return something like this:

```json
{
  "mentions": { "CrossReferencedEvent": 9 },
  "reactions": { "positive": 14, "negative": 0 },
  "comments": [
    { "positive": 0, "negative": 0 },
    { "positive": 12, "negative": 1 },
  ],
  "nbComments": 81
}
```

* `reactions` contains the number of positive and negative reactions to this issue.
* `nbComments` is the number of total comments from non-members.
* `comments` is the list of all comments each with their positive and negative reactions.
* `mentions` contains the number of times someone mentioned another issue or duplicated an issue to this one.
