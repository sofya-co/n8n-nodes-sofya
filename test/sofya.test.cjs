// Offline tests: run the built node with a stubbed n8n context and check the
// requests it would send. No network, no API key.
const test = require('node:test');
const assert = require('node:assert/strict');
const { NodeApiError, NodeOperationError } = require('n8n-workflow');
const { Sofya } = require('../dist/nodes/Sofya/Sofya.node.js');
const { SofyaApi } = require('../dist/credentials/SofyaApi.credentials.js');

function run(params, { respond, continueOnFail = false, items = 1 } = {}) {
	const node = new Sofya();
	const calls = [];
	const ctx = {
		getInputData: () => Array.from({ length: items }, () => ({ json: {} })),
		getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
		getNode: () => ({
			name: 'Sofya',
			type: 'n8n-nodes-sofya.sofya',
			typeVersion: 1,
			parameters: {},
		}),
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				calls.push({ credential, options });
				return respond ? respond(options) : { ok: true };
			},
		},
	};
	return node.execute.call(ctx).then((out) => ({ out, calls }));
}

test('credential uses Bearer auth and a free test request', () => {
	const cred = new SofyaApi();
	assert.equal(cred.name, 'sofyaApi');
	assert.equal(
		cred.authenticate.properties.headers.Authorization,
		'=Bearer {{$credentials.apiKey}}',
	);
	assert.equal(cred.test.request.url, '/v1/billing/balance');
	assert.equal(cred.test.request.method, 'GET');
});

test('node is usable as an AI tool', () => {
	assert.equal(new Sofya().description.usableAsTool, true);
});

test('search sends API defaults and options', async () => {
	const { calls } = await run({
		operation: 'search',
		query: 'n8n',
		searchOptions: {
			topic: 'news',
			freshness: ' week ',
			includeDomains: 'github.com, docs.n8n.io\nn8n.io',
			excludeDomains: '',
		},
	});
	const { credential, options } = calls[0];
	assert.equal(credential, 'sofyaApi');
	assert.equal(options.method, 'POST');
	assert.equal(options.baseURL, 'https://sofya.co');
	assert.equal(options.url, '/v1/search');
	assert.deepEqual(options.body, {
		query: 'n8n',
		search_depth: 'basic',
		max_results: 10,
		include_answer: false,
		topic: 'news',
		freshness: 'week',
		include_domains: ['github.com', 'docs.n8n.io', 'n8n.io'],
	});
});

test('fetch splits URLs and refuses more than 10', async () => {
	const { calls } = await run({ operation: 'fetch', urls: 'https://a.example, https://b.example' });
	assert.deepEqual(calls[0].options.body, {
		urls: ['https://a.example', 'https://b.example'],
		include_raw_html: false,
	});
	const many = Array.from({ length: 11 }, (_, n) => `https://x${n}.example`).join(',');
	await assert.rejects(run({ operation: 'fetch', urls: many }), NodeOperationError);
});

test('extract, research and balance hit the right endpoints', async () => {
	let r = await run({ operation: 'extract', url: ' https://a.example ', prompt: 'price?' });
	assert.equal(r.calls[0].options.url, '/v1/extract');
	assert.deepEqual(r.calls[0].options.body, { url: 'https://a.example', prompt: 'price?' });

	r = await run({ operation: 'research', researchQuery: 'q', researchOptions: { maxSources: 8 } });
	assert.equal(r.calls[0].options.url, '/v1/research');
	assert.deepEqual(r.calls[0].options.body, { query: 'q', max_sources: 8 });

	r = await run({ operation: 'getBalance' });
	assert.equal(r.calls[0].options.method, 'GET');
	assert.equal(r.calls[0].options.url, '/v1/billing/balance');
	assert.equal(r.calls[0].options.body, undefined);
});

test('API errors surface the detail message', async () => {
	const respond = () => {
		const err = new Error('Request failed with status code 402');
		err.response = { status: 402, data: { detail: 'Insufficient credits' } };
		throw err;
	};
	await assert.rejects(run({ operation: 'getBalance' }, { respond }), (e) => {
		assert.ok(e instanceof NodeApiError);
		assert.match(e.message, /Insufficient credits/);
		return true;
	});
	const { out } = await run(
		{ operation: 'getBalance' },
		{ respond, continueOnFail: true, items: 2 },
	);
	assert.equal(out[0].length, 2);
	assert.match(out[0][0].json.error, /Insufficient credits/);
	assert.deepEqual(out[0][1].pairedItem, { item: 1 });
});
