// This file is mostly adapted from:
// https://github.com/zeit/next.js/blob/3949c82bdfe268f841178979800aa8e71bbf412c/examples/with-apollo/lib/initApollo.js

import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
  NormalizedCacheObject,
  QueryOptions,
  useQuery,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { mergeDeep } from '@apollo/client/utilities';
import { createUploadLink } from 'apollo-upload-client';
import { isUndefined, omitBy, pick } from 'lodash';
import { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

import TwoFactorAuthenticationApolloLink from './two-factor-authentication/TwoFactorAuthenticationApolloLink';
import { getFromLocalStorage, LOCAL_STORAGE_KEYS } from './local-storage';
import { parseToBoolean } from './utils';

let apolloClient, customAgent;

const INTERNAL_API_V1_URL = process.env.INTERNAL_API_V1_URL;
const INTERNAL_API_V2_URL = process.env.INTERNAL_API_V2_URL;
const INTERNAL_API_V1_OPERATION_NAMES = process.env.INTERNAL_API_V1_OPERATION_NAMES;
const INTERNAL_API_V2_OPERATION_NAMES = process.env.INTERNAL_API_V2_OPERATION_NAMES;
export const APOLLO_STATE_PROP_NAME = '__APOLLO_STATE__' as const;
export const APOLLO_VARIABLES_PROP_NAME = '__APOLLO_VARIABLES__' as const;

const getBaseApiUrl = (apiVersion, internal = false) => {
  if (process.browser) {
    return '/api';
  }

  if (internal) {
    if (apiVersion === 'v1' && INTERNAL_API_V1_URL) {
      return INTERNAL_API_V1_URL;
    } else if (apiVersion === 'v2' && INTERNAL_API_V2_URL) {
      return INTERNAL_API_V2_URL;
    }
  }

  return process.env.API_URL || 'https://api.opencollective.com';
};

/**
 * Returns the GraphQL api url for the appropriate api version and environment.
 * @param {string} version - api version. Defaults to v1.
 * @returns {string} GraphQL api url.
 */
const getGraphqlUrl = (apiVersion, internal = false) => {
  const apiKey = !process.browser ? process.env.API_KEY : null;
  return `${getBaseApiUrl(apiVersion, internal)}/graphql/${apiVersion}${apiKey ? `?api_key=${apiKey}` : ''}`;
};

const getCustomAgent = () => {
  if (!customAgent) {
    const { FETCH_AGENT_KEEP_ALIVE, FETCH_AGENT_KEEP_ALIVE_MSECS } = process.env;
    const keepAlive = FETCH_AGENT_KEEP_ALIVE !== undefined ? parseToBoolean(FETCH_AGENT_KEEP_ALIVE) : true;
    const keepAliveMsecs = FETCH_AGENT_KEEP_ALIVE_MSECS ? Number(FETCH_AGENT_KEEP_ALIVE_MSECS) : 10000;
    const http = require('http');
    const https = require('https');
    const httpAgent = new http.Agent({ keepAlive, keepAliveMsecs });
    const httpsAgent = new https.Agent({ keepAlive, keepAliveMsecs });
    customAgent = _parsedURL => (_parsedURL.protocol === 'http:' ? httpAgent : httpsAgent);
  }
  return customAgent;
};

const serverSideFetch = async (url, options: { headers?: any; agent?: any; body?: string } = {}) => {
  const nodeFetch = require('node-fetch');

  options.agent = getCustomAgent();

  // Add headers to help the API identify origin of requests
  options.headers = options.headers || {};
  options.headers['oc-env'] = process.env.OC_ENV;
  options.headers['oc-secret'] = process.env.OC_SECRET;
  options.headers['oc-application'] = process.env.OC_APPLICATION;
  options.headers['user-agent'] = 'opencollective-frontend/1.0 node-fetch/1.0';

  // Start benchmarking if the request is server side
  const start = process.hrtime.bigint();

  const result = await nodeFetch(url, options);

  // Complete benchmark measure and log
  if (process.env.GRAPHQL_BENCHMARK) {
    const end = process.hrtime.bigint();
    const executionTime = Math.round(Number(end - start) / 1000000);
    const apiExecutionTime = result.headers.get('Execution-Time');
    const graphqlCache = result.headers.get('GraphQL-Cache');
    const latencyTime = apiExecutionTime ? executionTime - Number(apiExecutionTime) : null;
    const body = JSON.parse(options.body);
    if (body.operationName || body.variables) {
      const pickList = [
        'CollectiveId',
        'collectiveSlug',
        'CollectiveSlug',
        'id',
        'ledgacyId',
        'legacyExpenseId',
        'slug',
        'term',
        'tierId',
      ];
      const operationName = body.operationName || 'anonymous GraphQL query';
      const variables = pick(body.variables, pickList) || {};
      // eslint-disable-next-line no-console
      console.log(
        '-> Fetched',
        operationName,
        variables,
        executionTime ? `in ${executionTime}ms` : '',
        latencyTime ? `latency=${latencyTime}ms` : '',
        graphqlCache ? `GraphQL Cache ${graphqlCache}` : '',
      );
    }
  }

  return result;
};

function createLink({ twoFactorAuthContext }) {
  const authLink = setContext((_, { headers }) => {
    const token = getFromLocalStorage(LOCAL_STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
      return {
        headers: {
          authorization: `Bearer ${token}`,
          ...headers,
        },
      };
    }
  });

  const errorLink = onError(({ graphQLErrors, networkError }) => {
    if (graphQLErrors) {
      graphQLErrors.map(error => {
        if (error) {
          const { message, locations, path } = error;
          // eslint-disable-next-line no-console
          console.error(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`);
          return;
        }

        // eslint-disable-next-line no-console
        console.error('[GraphQL error]: Received null error');
      });
    }

    if (networkError) {
      // eslint-disable-next-line no-console
      console.error(`[Network error]: ${networkError}`);
    }
  });

  const linkFetch = process.browser ? fetch : serverSideFetch;

  const httpHeaders = { 'oc-application': process.env.OC_APPLICATION };

  const apiV1DefaultLink = createUploadLink({
    uri: getGraphqlUrl('v1'),
    fetch: linkFetch,
    headers: { ...httpHeaders, 'Apollo-Require-Preflight': 'true' },
  });
  const apiV2DefaultLink = createUploadLink({
    uri: getGraphqlUrl('v2'),
    fetch: linkFetch,
    headers: { ...httpHeaders, 'Apollo-Require-Preflight': 'true' },
  });

  // Setup internal links handling to be able to split traffic to different API servers
  const apiV1Link =
    INTERNAL_API_V1_URL && !process.browser
      ? ApolloLink.split(
          ({ operationName }) =>
            !INTERNAL_API_V1_OPERATION_NAMES || INTERNAL_API_V1_OPERATION_NAMES.split(',').includes(operationName),
          new HttpLink({ uri: getGraphqlUrl('v1', true), fetch: linkFetch, headers: httpHeaders }),
          apiV1DefaultLink,
        )
      : apiV1DefaultLink;

  const apiV2Link =
    INTERNAL_API_V2_URL && !process.browser
      ? ApolloLink.split(
          ({ operationName }) =>
            !INTERNAL_API_V2_OPERATION_NAMES || INTERNAL_API_V2_OPERATION_NAMES.split(',').includes(operationName),
          new HttpLink({ uri: getGraphqlUrl('v2', true), fetch: linkFetch, headers: httpHeaders }),
          apiV2DefaultLink,
        )
      : apiV2DefaultLink;

  /** Depending on the value of the context.apiVersion we choose to use the link for the api
   * v1 or the api v2.
   */
  const httpLink = ApolloLink.split(
    operation => operation.getContext().apiVersion === '2', // Routes the query to the proper client
    apiV2Link,
    apiV1Link,
  );

  const twoFactorAuthLink = new TwoFactorAuthenticationApolloLink(twoFactorAuthContext);

  return ApolloLink.from([errorLink, authLink, twoFactorAuthLink, httpLink]);
}

function createInMemoryCache() {
  const inMemoryCache = new InMemoryCache({
    // Documentation:
    // https://www.apollographql.com/docs/react/data/fragments/#using-fragments-with-unions-and-interfaces
    possibleTypes: {
      Transaction: ['Expense', 'Order'],
      CollectiveInterface: ['Collective', 'Event', 'Project', 'Fund', 'Organization', 'User', 'Vendor'],
      Account: ['Collective', 'Host', 'Individual', 'Fund', 'Project', 'Bot', 'Event', 'Organization', 'Vendor'],
      AccountWithHost: ['Collective', 'Event', 'Fund', 'Project'],
      AccountWithParent: ['Event', 'Project'],
      AccountWithContributions: ['Collective', 'Organization', 'Event', 'Fund', 'Project', 'Host'],
    },
    // Documentation:
    // https://www.apollographql.com/docs/react/caching/cache-field-behavior/#merging-non-normalized-objects
    typePolicies: {
      Event: {
        fields: {
          tiers: {
            merge(existing, incoming) {
              return incoming;
            },
          },
        },
      },
    },
  });

  return inMemoryCache;
}

function createClient({ initialState, twoFactorAuthContext }: any = {}) {
  const cache = createInMemoryCache();
  if (initialState) {
    cache.restore(initialState);
  }

  const link = createLink({ twoFactorAuthContext });

  return new ApolloClient({
    cache,
    link,
    connectToDevTools: process.browser,
    ssrMode: !process.browser, // Disables forceFetch on the server (so queries are only run once)
    ssrForceFetchDelay: 100, // See https://www.apollographql.com/docs/react/performance/server-side-rendering/#store-rehydration
  });
}

export function initClient({ initialState, twoFactorAuthContext }: any = {}): ReturnType<typeof createClient> {
  // Make sure to create a new client for every server-side request so that data
  // isn't shared between connections (which would be bad)
  if (!process.browser) {
    return createClient({ initialState });
  }

  // Reuse client on the client-side
  if (!apolloClient) {
    apolloClient = createClient({ initialState, twoFactorAuthContext });
  }

  // If the page has Next.js data fetching methods that use Apollo Client, the initial state
  // get hydrated here
  if (initialState) {
    // Get existing cache, loaded during client side data fetching
    const existingCache = apolloClient.extract();

    // Merge the existing cache into data passed from getStaticProps/getServerSideProps
    const data = mergeDeep(initialState, existingCache);

    // Restore the cache with the merged data
    apolloClient.cache.restore(data);
  }

  return apolloClient;
}

type SSRQueryHelperProps<TVariables> = {
  [APOLLO_STATE_PROP_NAME]: NormalizedCacheObject;
  [APOLLO_VARIABLES_PROP_NAME]: Partial<TVariables>;
};

/**
 * A helper to easily plug Apollo on functional components that use `getServerSideProps` thats make sure that
 * the server-side query and the client-side query/variables are the same; to properly rehydrate the cache.
 */
export function getSSRQueryHelpers<TVariables, TProps = {}>({
  query,
  getVariablesFromContext = undefined,
  getPropsFromContext = undefined,
  ...queryOptions
}: QueryOptions<TVariables> & {
  getPropsFromContext?: (context: GetServerSidePropsContext) => TProps;
  getVariablesFromContext?: (context: GetServerSidePropsContext, props: Partial<TProps>) => TVariables;
}) {
  type ServerSideProps = TProps & SSRQueryHelperProps<TVariables>;
  return {
    getServerSideProps: async (
      context: GetServerSidePropsContext,
    ): Promise<GetServerSidePropsResult<ServerSideProps>> => {
      const props = (getPropsFromContext && getPropsFromContext(context)) || {};
      const variables = (getVariablesFromContext && getVariablesFromContext(context, props)) || {};
      const client = initClient();
      await client.query({ query, variables, ...queryOptions }); // No handling the result here, we just want to make sure the query is in the cache
      return {
        props: {
          ...omitBy<TProps>(props, isUndefined),
          [APOLLO_STATE_PROP_NAME]: client.cache.extract(),
          [APOLLO_VARIABLES_PROP_NAME]: omitBy<TVariables>(variables, isUndefined) as Partial<TVariables>,
        } as ServerSideProps,
      };
    },
    useQuery: (pageProps: ServerSideProps) => {
      const variables = pageProps[APOLLO_VARIABLES_PROP_NAME] as TVariables;
      return useQuery(query, { variables, ...queryOptions });
    },
    getVariablesFromPageProps: (pageProps: ServerSideProps): Partial<TVariables> => {
      return pageProps[APOLLO_VARIABLES_PROP_NAME];
    },
  };
}
