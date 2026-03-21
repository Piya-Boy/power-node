import { channel, topic } from "@inngest/realtime";

export const GOOGLE_SERVICES_CHANNEL_NAME = "google-services-execution";

export const googleServicesChannel = channel(GOOGLE_SERVICES_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error";
    }>(),
  );
