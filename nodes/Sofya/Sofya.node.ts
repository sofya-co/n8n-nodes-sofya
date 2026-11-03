import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export const BASE_URL = 'https://sofya.co';

// Client-side limits, a little above the server's own per-endpoint limits so
// the API answers with its own error (and refund) before n8n gives up.
const TIMEOUT_MS: Record<string, number> = {
	search: 75_000,
	fetch: 75_000,
	extract: 75_000,
	research: 75_000,
	getBalance: 30_000,
};

const MAX_URLS = 10;
const MAX_DOMAINS = 10;

const topicOption: INodeProperties = {
	displayName: 'Topic',
	name: 'topic',
	type: 'options',
	options: [
		{ name: 'General', value: 'general', description: 'Web search' },
		{ name: 'News', value: 'news', description: 'News articles' },
	],
	default: 'general',
	description: 'What kind of results to search for',
};

const freshnessOption: INodeProperties = {
	displayName: 'Freshness',
	name: 'freshness',
	type: 'string',
	default: '',
	placeholder: 'e.g. week',
	description:
		'Only results from this period: "day", "week", "month", "year", or a date range "YYYY-MM-DD:YYYY-MM-DD". Leave empty for any time.',
};

/** Split comma or newline separated text into a clean list. */
function splitList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((v) => String(v).trim()).filter((v) => v !== '');
	}
	if (typeof value !== 'string') return [];
	return value
		.split(/[\n,]/)
		.map((v) => v.trim())
		.filter((v) => v !== '');
}

export class Sofya implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Sofya',
		name: 'sofya',
		icon: { light: 'file:sofya.svg', dark: 'file:sofya.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Search the web, fetch pages as text, extract answers from a page and run cited research',
		defaults: {
			name: 'Sofya',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'sofyaApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Extract',
						value: 'extract',
						description: 'Answer a question or pull specific information from one page with AI',
						action: 'Extract information from page',
					},
					{
						name: 'Fetch',
						value: 'fetch',
						description: 'Get the readable text of web pages and documents (PDF, DOCX and more)',
						action: 'Fetch pages',
					},
					{
						name: 'Get Balance',
						value: 'getBalance',
						description: 'Get the credit balance of the account. Free.',
						action: 'Get credit balance',
					},
					{
						name: 'Research',
						value: 'research',
						description: 'Run many searches and write a cited report on a question',
						action: 'Research a question',
					},
					{
						name: 'Search',
						value: 'search',
						description: 'Search the web and get page content for each result',
						action: 'Search web',
					},
				],
				default: 'search',
			},

			// ----- Search -----
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. latest stable release of PostgreSQL',
				description: 'What to search for',
				displayOptions: { show: { operation: ['search'] } },
			},
			{
				displayName: 'Search Depth',
				name: 'searchDepth',
				type: 'options',
				options: [
					{
						name: 'Basic',
						value: 'basic',
						description: 'Results with the text of each page (2 credits)',
					},
					{
						name: 'Snippets',
						value: 'snippets',
						description: 'Results with short snippets only, fastest (1 credit)',
					},
				],
				default: 'basic',
				description: 'How much content to return for each result',
				displayOptions: { show: { operation: ['search'] } },
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 20 },
				default: 10,
				description: 'Max number of results to return',
				displayOptions: { show: { operation: ['search'] } },
			},
			{
				displayName: 'Include Answer',
				name: 'includeAnswer',
				type: 'boolean',
				default: false,
				description: 'Whether to add a short AI answer written from the results (adds 2 credits)',
				displayOptions: { show: { operation: ['search'] } },
			},
			{
				displayName: 'Options',
				name: 'searchOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['search'] } },
				options: [
					{
						displayName: 'Exclude Domains',
						name: 'excludeDomains',
						type: 'string',
						default: '',
						placeholder: 'e.g. pinterest.com, quora.com',
						description: 'Leave out results from these domains. Comma-separated, up to 10.',
					},
					freshnessOption,
					{
						displayName: 'Include Domains',
						name: 'includeDomains',
						type: 'string',
						default: '',
						placeholder: 'e.g. github.com, docs.python.org',
						description: 'Only return results from these domains. Comma-separated, up to 10.',
					},
					topicOption,
				],
			},

			// ----- Fetch -----
			{
				displayName: 'URLs',
				name: 'urls',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. https://example.com/page, https://example.com/report.pdf',
				description:
					'Pages or documents to fetch. Comma- or newline-separated, up to 10. 1 credit per URL.',
				displayOptions: { show: { operation: ['fetch'] } },
			},
			{
				displayName: 'Options',
				name: 'fetchOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['fetch'] } },
				options: [
					{
						displayName: 'Include Raw HTML',
						name: 'includeRawHtml',
						type: 'boolean',
						default: false,
						description: 'Whether to also return the HTML source of each page',
					},
				],
			},

			// ----- Extract -----
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. https://example.com/pricing',
				description: 'The page to read',
				displayOptions: { show: { operation: ['extract'] } },
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 3 },
				required: true,
				default: '',
				placeholder: 'e.g. List all pricing tiers with their features',
				description: 'What to extract from the page',
				displayOptions: { show: { operation: ['extract'] } },
			},

			// ----- Research -----
			{
				displayName: 'Query',
				name: 'researchQuery',
				type: 'string',
				typeOptions: { rows: 2 },
				required: true,
				default: '',
				placeholder: 'e.g. How do the main vector databases compare on hybrid search?',
				description: 'The question or topic to research (50 credits)',
				displayOptions: { show: { operation: ['research'] } },
			},
			{
				displayName: 'Options',
				name: 'researchOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['research'] } },
				options: [
					freshnessOption,
					{
						displayName: 'Max Sources',
						name: 'maxSources',
						type: 'number',
						typeOptions: { minValue: 5, maxValue: 30 },
						default: 20,
						description: 'Max number of sources the report draws on',
					},
					topicOption,
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			let failure: NodeApiError | NodeOperationError | undefined;
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let method: IHttpRequestMethods = 'POST';
				let path: string;
				let body: IDataObject | undefined;

				if (operation === 'search') {
					const options = this.getNodeParameter('searchOptions', i, {}) as IDataObject;
					body = {
						query: this.getNodeParameter('query', i) as string,
						search_depth: this.getNodeParameter('searchDepth', i, 'basic') as string,
						max_results: this.getNodeParameter('maxResults', i, 10) as number,
						include_answer: this.getNodeParameter('includeAnswer', i, false) as boolean,
					};
					if (options.topic) body.topic = options.topic;
					const freshness = String(options.freshness ?? '').trim();
					if (freshness) body.freshness = freshness;
					for (const [key, label, field] of [
						['includeDomains', 'Include Domains', 'include_domains'],
						['excludeDomains', 'Exclude Domains', 'exclude_domains'],
					]) {
						const domains = splitList(options[key]);
						if (domains.length > MAX_DOMAINS) {
							throw new NodeOperationError(
								this.getNode(),
								`'${label}' has ${domains.length} domains. Enter at most ${MAX_DOMAINS}.`,
								{ itemIndex: i },
							);
						}
						if (domains.length) body[field] = domains;
					}
					path = '/v1/search';
				} else if (operation === 'fetch') {
					const urls = splitList(this.getNodeParameter('urls', i));
					if (urls.length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							"The 'URLs' field is empty. Enter at least one URL to fetch.",
							{
								itemIndex: i,
							},
						);
					}
					if (urls.length > MAX_URLS) {
						throw new NodeOperationError(
							this.getNode(),
							`'URLs' has ${urls.length} URLs. Fetch at most ${MAX_URLS} at once, and put the rest in more items.`,
							{ itemIndex: i },
						);
					}
					const options = this.getNodeParameter('fetchOptions', i, {}) as IDataObject;
					body = { urls, include_raw_html: options.includeRawHtml === true };
					path = '/v1/fetch';
				} else if (operation === 'extract') {
					body = {
						url: (this.getNodeParameter('url', i) as string).trim(),
						prompt: this.getNodeParameter('prompt', i) as string,
					};
					path = '/v1/extract';
				} else if (operation === 'research') {
					const options = this.getNodeParameter('researchOptions', i, {}) as IDataObject;
					body = { query: this.getNodeParameter('researchQuery', i) as string };
					if (options.topic) body.topic = options.topic;
					const freshness = String(options.freshness ?? '').trim();
					if (freshness) body.freshness = freshness;
					if (options.maxSources !== undefined) body.max_sources = options.maxSources;
					path = '/v1/research';
				} else if (operation === 'getBalance') {
					method = 'GET';
					path = '/v1/billing/balance';
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
						itemIndex: i,
					});
				}

				const request: IHttpRequestOptions = {
					method,
					baseURL: BASE_URL,
					url: path,
					headers: { Accept: 'application/json' },
					json: true,
					timeout: TIMEOUT_MS[operation],
				};
				if (body) request.body = body;

				let response: IDataObject;
				try {
					response = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sofyaApi',
						request,
					)) as IDataObject;
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject, {
						itemIndex: i,
						message: apiErrorMessage(error),
					});
				}

				returnData.push({ json: response, pairedItem: { item: i } });
			} catch (error) {
				// Errors are thrown below, outside the catch, already wrapped in an n8n error class.
				failure =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}

			if (failure) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: failure.message }, pairedItem: { item: i } });
					continue;
				}
				throw failure;
			}
		}

		return [returnData];
	}
}

/** Sofya errors are {"detail": "..."}; show that text instead of a bare status code. */
function apiErrorMessage(error: unknown): string | undefined {
	const e = error as {
		response?: { data?: unknown; body?: unknown };
		cause?: { response?: { data?: unknown } };
		description?: unknown;
	};
	const data = e?.response?.data ?? e?.response?.body ?? e?.cause?.response?.data;
	let parsed: unknown = data;
	if (typeof data === 'string') {
		try {
			parsed = JSON.parse(data);
		} catch {
			return undefined;
		}
	}
	const detail = (parsed as { detail?: unknown } | undefined)?.detail;
	if (typeof detail === 'string') return detail;
	if (Array.isArray(detail)) {
		// Validation errors: [{loc: [...], msg: "..."}]
		return detail
			.map((d: { loc?: unknown[]; msg?: string }) => {
				const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body').join('.') : '';
				return field ? `${field}: ${d.msg}` : String(d.msg);
			})
			.join('; ');
	}
	return undefined;
}
