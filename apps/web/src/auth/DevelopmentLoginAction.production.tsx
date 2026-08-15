import type { DevelopmentIdentity } from './session';

export function DevelopmentLoginAction(props: {
  onAuthenticate: (identity: DevelopmentIdentity) => Promise<void>;
}) {
  void props;
  return null;
}
