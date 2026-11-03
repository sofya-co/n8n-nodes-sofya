import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SofyaApi implements ICredentialType {
	name = 'sofyaApi';

	displayName = 'Sofya API';

	icon: Icon = {
		light: 'file:../nodes/Sofya/sofya.svg',
		dark: 'file:../nodes/Sofya/sofya.dark.svg',
	};

	documentationUrl = 'https://github.com/sofya-co/n8n-nodes-sofya#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Sofya API key (starts with sofya_live_). Create one at https://sofya.co/dashboard.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Checking the balance is free, so testing the credential never spends credits.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://sofya.co',
			url: '/v1/billing/balance',
			method: 'GET',
		},
	};
}
