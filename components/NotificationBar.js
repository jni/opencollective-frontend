import React from 'react';
import PropTypes from 'prop-types';
import { Close } from '@styled-icons/material/Close';
import { themeGet } from '@styled-system/theme-get';
import styled from 'styled-components';

import Container from './Container';
import { Flex } from './Grid';
import Link from './Link';
import StyledLinkButton from './StyledLinkButton';
import { H1, P } from './Text';

export const NotificationBarLink = styled(Link)`
  color: ${props => props.theme.colors.blue[900]};
  font-weight: 700;
  text-decoration-line: underline;
  text-decoration-thickness: 2px;
  font-size: 0.85rem;
  line-height: 1.25rem;
`;

export const NotificationBarButton = styled(StyledLinkButton)`
  color: ${props => props.theme.colors.blue[900]};
  font-weight: 700;
  text-decoration-line: underline;
  text-decoration-thickness: 2px;
  font-size: 0.85rem;
  line-height: 1.25rem;
`;

const CloseIcon = styled(Close)`
  font-size: 12px;
  width: 24px;
  height: 24px;
  padding: 4px;
  background: #fff;
  color: ${props => props.theme.colors.blue[900]};
  border-radius: 99999px;
  cursor: pointer;
`;

const NotificationBarContainer = styled(Container)`
  background-color: ${props => getBackgroundColor(props.type)};
  color: ${props => props.theme.colors.blue[900]};
  position: relative;
`;

const getBackgroundColor = type => {
  switch (type) {
    case 'warning':
      return themeGet('colors.yellow.100');
    case 'error':
      return themeGet('colors.red.100');
    case 'success':
      return themeGet('colors.green.100');
    case 'info':
    default:
      return themeGet('colors.blue.200');
  }
};

const NotificationBar = ({ title, description, type, actions, inline, dismiss }) => {
  return (
    <NotificationBarContainer
      data-cy="notification-bar"
      type={type}
      display="flex"
      alignItems="center"
      flexDirection="row"
      padding="12px 25px"
    >
      <Container display="flex" alignItems="center" flexDirection="column" textAlign="center" flex="1">
        <Container maxWidth={inline ? '1200px' : '672px'}>
          {title && (
            <H1
              fontSize="0.85rem"
              lineHeight="1.25rem"
              mx="4px"
              textAlign="center"
              letterSpacing="0px"
              {...(description && { mb: '6px' })}
              {...(inline && { display: 'inline' })}
            >
              {title}
            </H1>
          )}
          {description && (
            <P
              fontSize="0.85rem"
              lineHeight="1.25rem"
              textAlign="center"
              letterSpacing="0px"
              mx="4px"
              {...(inline && { display: 'inline' })}
              {...(actions && { mb: '6px' })}
            >
              {description}
            </P>
          )}

          {actions && (
            <Container display={inline ? 'inline-flex' : 'block'} mx="4px">
              <Flex justifyContent="center" gridGap="8px">
                {Array.isArray(actions) ? actions.map(action => action) : actions}
              </Flex>
            </Container>
          )}
        </Container>
      </Container>

      {dismiss && (
        <StyledLinkButton onClick={dismiss}>
          <CloseIcon />
        </StyledLinkButton>
      )}
    </NotificationBarContainer>
  );
};

NotificationBar.propTypes = {
  title: PropTypes.node,
  description: PropTypes.node,
  type: PropTypes.oneOf(['info', 'success', 'error', 'warning']),
  inline: PropTypes.bool,
  actions: PropTypes.oneOf([PropTypes.node, PropTypes.arrayOf(PropTypes.node)]),
  dismiss: PropTypes.func,
};

export default NotificationBar;
