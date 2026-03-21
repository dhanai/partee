import { HeaderBackButton } from "@react-navigation/elements";
import type { ComponentProps } from "react";

export type ProfileStackHeaderBackProps = ComponentProps<typeof HeaderBackButton>;

type NavWalk = {
  canGoBack(): boolean;
  goBack(): void;
  getParent(): unknown;
};

/**
 * Profile routes sit in a nested stack whose index has no inner back target; the real pop is on
 * a parent (e.g. root after Round). Walk up until we find a navigator that can goBack.
 */
export function renderProfileStackHeaderLeft(navigation: unknown, props: ProfileStackHeaderBackProps) {
  let nav = navigation as NavWalk | undefined;
  while (nav) {
    if (nav.canGoBack()) {
      const target = nav;
      return <HeaderBackButton {...props} onPress={() => target.goBack()} />;
    }
    nav = nav.getParent() as NavWalk | undefined;
  }
  return null;
}
