import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { ApolloProvider } from '@apollo/client';
import App from 'next/app';
import Router from 'next/router';
import NProgress from 'nprogress';
import { ThemeProvider } from 'styled-components';

import '../lib/dayjs'; // Import first to make sure plugins are initialized
import { getIntlProps } from '../lib/i18n/request';
import theme from '../lib/theme';
import defaultColors from '../lib/theme/colors';

import DefaultPaletteStyle from '../components/DefaultPaletteStyle';
import StripeProviderSSR from '../components/StripeProvider';
import TwoFactorAuthenticationModal from '../components/two-factor-authentication/TwoFactorAuthenticationModal';
import UserProvider from '../components/UserProvider';

import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'nprogress/nprogress.css';
import 'trix/dist/trix.css';
import '../public/static/styles/app.css';

Router.onRouteChangeStart = (url, { shallow }) => {
  if (!shallow) {
    NProgress.start();
  }
};

Router.onRouteChangeComplete = () => NProgress.done();

Router.onRouteChangeError = () => NProgress.done();

import memoizeOne from 'memoize-one';

import { APOLLO_STATE_PROP_NAME, initClient } from '../lib/apollo-client';
import { getGoogleMapsScriptUrl, loadGoogleMaps } from '../lib/google-maps';
import sentryLib from '../server/sentry';

import GlobalNewsAndUpdates from '../components/GlobalNewsAndUpdates';
import GlobalToasts from '../components/GlobalToasts';
import IntlProvider from '../components/intl/IntlProvider';
import NewsAndUpdatesProvider from '../components/NewsAndUpdatesProvider';
import ToastProvider from '../components/ToastProvider';
import { TooltipProvider } from '../components/ui/Tooltip';

class OpenCollectiveFrontendApp extends App {
  static propTypes = {
    pageProps: PropTypes.object.isRequired,
    scripts: PropTypes.object.isRequired,
    locale: PropTypes.string,
    messages: PropTypes.object,
  };

  constructor() {
    super(...arguments);
    this.state = { hasError: false, errorEventId: undefined };
  }

  static async getInitialProps({ Component, ctx, client }) {
    const props = { pageProps: { skipDataFromTree: true }, scripts: {}, ...getIntlProps(ctx) };

    try {
      if (Component.getInitialProps) {
        props.pageProps = await Component.getInitialProps({ ...ctx, client });
      }

      if (props.pageProps.scripts) {
        if (props.pageProps.scripts.googleMaps) {
          if (ctx.req) {
            props.scripts['google-maps'] = getGoogleMapsScriptUrl();
          } else {
            try {
              await loadGoogleMaps();
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error(e);
            }
          }
        }
      }
    } catch (error) {
      return { ...props, hasError: true, errorEventId: sentryLib.captureException(error, ctx) };
    }

    return props;
  }

  static getDerivedStateFromProps(props, state) {
    // If there was an error generated within getInitialProps, and we haven't
    // yet seen an error, we add it to this.state here
    return {
      hasError: props.hasError || state.hasError || false,
      errorEventId: props.errorEventId || state.errorEventId || undefined,
    };
  }

  componentDidCatch(error, errorInfo) {
    const errorEventId = sentryLib.captureException(error, { errorInfo });
    this.setState({ hasError: true, errorEventId });
    super.componentDidCatch(error, errorInfo);
  }

  componentDidMount() {
    Router.events.on('routeChangeComplete', url => {
      if (window && window._paq) {
        if (url.match(/\/signin\/sent/)) {
          window._paq.push(['setCustomUrl', '/signin/sent']);
        } else {
          window._paq.push(['setCustomUrl', url]);
        }
        window._paq.push(['trackPageView']);
      }
    });
  }

  getApolloClient = memoizeOne(pageProps => {
    return initClient({ initialState: pageProps[APOLLO_STATE_PROP_NAME] });
  });

  render() {
    const { Component, pageProps, scripts, locale } = this.props;
    return (
      <Fragment>
        <ApolloProvider client={this.getApolloClient(pageProps)}>
          <ThemeProvider theme={theme}>
            <StripeProviderSSR>
              <IntlProvider locale={locale}>
                <TooltipProvider delayDuration={500} skipDelayDuration={100}>
                  <ToastProvider>
                    <UserProvider>
                      <NewsAndUpdatesProvider>
                        <Component {...pageProps} />
                        <GlobalToasts />
                        <GlobalNewsAndUpdates />
                        <TwoFactorAuthenticationModal />
                      </NewsAndUpdatesProvider>
                    </UserProvider>
                  </ToastProvider>
                </TooltipProvider>
              </IntlProvider>
            </StripeProviderSSR>
          </ThemeProvider>
        </ApolloProvider>
        <DefaultPaletteStyle palette={defaultColors.primary} />
        {Object.keys(scripts).map(key => (
          <script key={key} type="text/javascript" src={scripts[key]} />
        ))}
      </Fragment>
    );
  }
}

export default OpenCollectiveFrontendApp;
