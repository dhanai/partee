import { Redirect } from "expo-router";

/** Auth forms are now bottom sheets on the welcome screen. */
export default function AccountRedirect() {
  return <Redirect href="/(auth)" />;
}
