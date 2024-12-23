import { redirect } from "next/navigation";
import { getServerAuthSession } from "~/server/auth";
import Design from "./Design";
import { Suspense } from "react";

const DesignPage = async ({
  params,
}: {
  params: { org: string; repo: string };
}) => {
  const { user } = (await getServerAuthSession()) ?? {};
  if (!user?.login || !user.dashboardEnabled) {
    redirect("/");
  }

  const { org, repo } = params;
  return (
    <Suspense>
      <Design org={org} repo={repo} />
    </Suspense>
  );
};

export default DesignPage;
