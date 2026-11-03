# n8n-nodes-sofya

This is an n8n community node for [Sofya](https://sofya.co), a web search API built for AI agents. It lets you search the web, fetch pages and documents as clean text, extract answers from a page with AI, and run multi-source research with a cited report, in any n8n workflow or as a tool for the n8n AI Agent.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Credit costs](#credit-costs)
- [Usage](#usage)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

In short: in n8n go to **Settings > Community Nodes > Install**, enter `n8n-nodes-sofya`, and confirm. Once the node is verified it can also be added straight from the nodes panel by searching for **Sofya**, on n8n Cloud as well.

## Credentials

You need a Sofya API key.

1. Sign in at [sofya.co](https://sofya.co) and open the [dashboard](https://sofya.co/dashboard).
2. Create an API key. Keys start with `sofya_live_`.
3. In n8n, create a new **Sofya API** credential and paste the key.

n8n checks the key by reading your credit balance, which is free. The key is sent as an `Authorization: Bearer` header to `https://sofya.co`.

## Operations

| Operation | What it does | Main fields |
|---|---|---|
| **Search** | Searches the web and returns results with the text of each page, and optionally a short AI answer. | Query, Search Depth (`basic` or `snippets`), Max Results (1-20, default 10), Include Answer. Options: Topic (`general` or `news`), Freshness, Include Domains, Exclude Domains. |
| **Fetch** | Returns the readable text of up to 10 URLs: web pages and documents such as PDF, DOCX, XLSX and PPTX. | URLs (comma- or newline-separated). Option: Include Raw HTML. |
| **Extract** | Reads one page and answers your prompt about it with AI. | URL, Prompt. |
| **Research** | Runs several searches, reads the sources and writes a cited report. Takes up to about a minute. | Query. Options: Topic, Freshness, Max Sources (5-30, default 20). |
| **Get Balance** | Returns your credit balance and a top-up link. | None. |

**Freshness** takes `day`, `week`, `month`, `year`, or a date range such as `2026-01-01:2026-06-30`. Leave it empty for results from any time.

**Include Domains** and **Exclude Domains** take bare hostnames such as `github.com`, comma-separated, up to 10 each.

Each operation returns the API response as one item. For example, Search returns `query`, `answer`, `results` (each with `title`, `url`, `content`, `description`, `fetched`, `published_date`), `credits_used` and `credits_remaining`. The full response formats are in the [API documentation](https://sofya.co/docs).

## Credit costs

| Operation | Credits |
|---|---|
| Search, `snippets` depth | 1 |
| Search, `basic` depth (default) | 2 |
| Include Answer | +2 |
| Fetch | 1 per URL |
| Extract | 10 (1 when the page has too little text to answer from) |
| Research | 50 |
| Get Balance | free |

Sofya is pay as you go, from $10. GitHub accounts a year or older get free monthly credits. See [pricing](https://sofya.co/pricing).

## Usage

### As a tool for the AI Agent

1. Add an **AI Agent** node to your workflow.
2. Under **Tool**, click **+** and choose **Sofya**.
3. Pick the operation the agent may use, for example **Search**. To let the model fill a field itself, click the field's **Let the model define this parameter** button (or use a `$fromAI()` expression), for example on **Query**.

Add the Sofya tool more than once to give the agent several operations, such as Search for finding pages and Fetch for reading a page in full.

On a self-hosted n8n where Sofya does not show up in the tool list, set the environment variable `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` and restart n8n.

### In a regular workflow

A simple research pipeline:

1. **Schedule Trigger**, every morning.
2. **Sofya**, operation **Search**, Query `release notes n8n`, Options > Topic `news`, Freshness `day`.
3. **Split Out** on `results`, then send each `title` and `url` to Slack or email.

Example workflow, ready to paste into the n8n editor:

```json
{
  "nodes": [
    {
      "parameters": {},
      "name": "When clicking 'Execute workflow'",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [0, 0]
    },
    {
      "parameters": {
        "operation": "search",
        "query": "open source workflow automation",
        "maxResults": 5,
        "includeAnswer": true,
        "searchOptions": { "freshness": "month" }
      },
      "name": "Sofya",
      "type": "n8n-nodes-sofya.sofya",
      "typeVersion": 1,
      "position": [220, 0],
      "credentials": { "sofyaApi": { "id": "", "name": "Sofya API" } }
    }
  ],
  "connections": {
    "When clicking 'Execute workflow'": {
      "main": [[{ "node": "Sofya", "type": "main", "index": 0 }]]
    }
  }
}
```

Select your own Sofya API credential on the Sofya node after pasting.

### Errors

Errors from the API are shown with their message, for example a field that failed validation or an account that is out of credits. Turn on **Settings > On Error > Continue** to get the error as an `error` field on the item instead of stopping the workflow. Use **Get Balance** to find the top-up link.

## Compatibility

Built with `@n8n/node-cli` against the n8n node API version 1. Requires n8n 1.0 or newer.

## Resources

- [Sofya API documentation](https://sofya.co/docs)
- [Sofya pricing](https://sofya.co/pricing)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- Support: [support@sofya.co](mailto:support@sofya.co)

## License

[MIT](LICENSE.md)
