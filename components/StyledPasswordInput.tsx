import React from 'react';
import { Eye } from '@styled-icons/feather/Eye';
import { EyeOff } from '@styled-icons/feather/EyeOff';
import { useIntl } from 'react-intl';
import styled from 'styled-components';

import Container from './Container';
import { Flex } from './Grid';
import StyledInput from './StyledInput';

type StyledPasswordInputProps = {
  name: string;
} & Omit<React.HTMLProps<HTMLInputElement>, 'type' | 'as'>;

const Toggle = styled.button.attrs({ type: 'button', role: 'switch' })`
  all: unset;
  position: absolute;
  cursor: pointer;
  right: 8px;
  &:hover {
    opacity: 0.75;
  }
`;

/**
 * A styled password input that can be toggled to show the password in clear text.
 */
export const StyledPasswordInput = ({ name, ...props }: StyledPasswordInputProps) => {
  const intl = useIntl();
  const [passwordShown, setPasswordShown] = React.useState(false);
  const Icon = passwordShown ? EyeOff : Eye;
  const label = passwordShown
    ? intl.formatMessage({ id: 'Hide', defaultMessage: 'Hide' })
    : intl.formatMessage({ defaultMessage: 'Show' });

  return (
    <Container position="relative" display="inline-block">
      <Flex alignItems="center" justifyContent="flex-end" width="100%">
        <StyledInput
          flex="1 1"
          autoComplete={name}
          {...props}
          name={name}
          type={passwordShown ? 'text' : 'password'}
          px={null}
          pl="16px"
          onChange={e => props.onChange?.(e)}
          pr="36px"
        />
        <Toggle
          aria-checked={passwordShown}
          onClick={() => setPasswordShown(!passwordShown)}
          aria-label={label}
          title={label}
        >
          <i>
            <Icon size="1.75em" />
          </i>
        </Toggle>
      </Flex>
    </Container>
  );
};
