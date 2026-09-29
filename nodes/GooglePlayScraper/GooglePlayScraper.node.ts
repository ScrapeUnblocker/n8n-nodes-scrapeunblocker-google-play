import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type { OptionField } from './GenericFunctions';
import { applyOptions, requireString, runActorAndGetItems } from './GenericFunctions';

// ScrapeUnblocker's public "Google Play Scraper" Actor: https://apify.com/scrapeunblocker/google-play-scraper
const ACTOR_ID = 'TeuKgYV64phl2S7pj';
const INTEGRATION_APP_ID = 'scrapeunblocker-google-play-scraper';

// Node option name -> Actor input key.
const OPTION_FIELDS: Record<string, OptionField> = {
	language: {
		key: 'hl',
	},
	country: {
		key: 'gl',
	},
	proxyCountry: {
		key: 'proxy_country',
		kind: 'upper',
	},
};

function buildActorInput(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	options: IDataObject,
	itemIndex: number,
): IDataObject {
	const input: IDataObject = {};

	switch (`${resource}:${operation}`) {
		case 'app:get': {
			input.app_id = requireString.call(this, 'appId', 'App Package ID', itemIndex);
			input.mode = 'app';
			break;
		}
		case 'app:search': {
			input.q = requireString.call(this, 'query', 'Search Query', itemIndex);
			input.max_results = this.getNodeParameter('maxResults', itemIndex);
			input.mode = 'search';
			break;
		}
		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for resource "${resource}"`,
				{ itemIndex },
			);
	}

	applyOptions(input, options, OPTION_FIELDS);
	return input;
}

export class GooglePlayScraper implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Google Play Scraper',
		name: 'googlePlayScraper',
		icon: {
			light: 'file:googlePlayScraper.png',
			dark: 'file:googlePlayScraper.dark.png',
		},
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Get Google Play app details or search apps with the ScrapeUnblocker Actor on Apify',
		defaults: {
			name: 'Google Play Scraper',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'apifyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'App',
						value: 'app',
					},
				],
				default: 'app',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['app'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get the full details of one app by its package ID',
						action: 'Get an app',
					},
					{
						name: 'Search',
						value: 'search',
						description: 'Search Google Play apps by keyword',
						action: 'Search apps',
					},
				],
				default: 'get',
			},
			{
				displayName: 'App Package ID',
				name: 'appId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'com.whatsapp',
				description:
					"The Google Play package ID, e.g. 'com.whatsapp' or 'com.spotify.music'. You find it at the end of the app's Google Play URL.",
				displayOptions: {
					show: {
						resource: ['app'],
						operation: ['get'],
					},
				},
			},
			{
				displayName: 'Search Query',
				name: 'query',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'photo editor',
				description: "The keyword to search for, e.g. 'vpn' or 'photo editor'",
				displayOptions: {
					show: {
						resource: ['app'],
						operation: ['search'],
					},
				},
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				default: 30,
				description: 'How many apps to return (1-100, one results page)',
				displayOptions: {
					show: {
						resource: ['app'],
						operation: ['search'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Language',
						name: 'language',
						type: 'string',
						default: '',
						placeholder: 'en',
						description: 'Store language as an ISO code, e.g. en, de or es. Defaults to en.',
					},
					{
						displayName: 'Proxy Country',
						name: 'proxyCountry',
						type: 'string',
						default: '',
						placeholder: 'US',
						description: 'Exit-IP country (ISO-2, e.g. US). Leave empty to pick one automatically.',
					},
					{
						displayName: 'Store Country',
						name: 'country',
						type: 'string',
						default: '',
						placeholder: 'us',
						description:
							'Store country as an ISO-2 code, e.g. us, gb or de. It sets prices and availability. Defaults to us.',
					},
					{
						displayName: 'Timeout (Seconds)',
						name: 'timeout',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 0,
						description:
							'Maximum run time of the Apify Actor run. 0 keeps the Actor default. A run that times out fails the node.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const { timeout, ...actorOptions } = options;

				const input = buildActorInput.call(this, resource, operation, actorOptions, i);
				const { items: results } = await runActorAndGetItems.call(this, {
					actorId: ACTOR_ID,
					integrationAppId: INTEGRATION_APP_ID,
					input,
					itemIndex: i,
					timeoutSecs: (timeout as number) || undefined,
				});

				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors return an error of their own class unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
