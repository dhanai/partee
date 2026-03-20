import { Redirect } from "expo-router";

/** Use unified account sheet; keeps deep links working without a second stack transition. */
export default function SignInRedirect() {
  return <Redirect href={{ pathname: "/(auth)/account", params: { mode: "signIn" } }} />;
}
