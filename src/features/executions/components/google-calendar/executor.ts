import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { googleServicesChannel } from "@/inngest/channels/google-services";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

type GoogleCalendarData = {
  variableName?: string;
  credentialId?: string;
  operation?: "list_events" | "create_event" | "delete_event";
  calendarId?: string;
  summary?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  eventId?: string;
  timeMin?: string;
  timeMax?: string;
};

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export const googleCalendarExecutor: NodeExecutor<GoogleCalendarData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(googleServicesChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Calendar node: Variable name is missing");
  }
  if (!data.credentialId) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Calendar node: Credential is required");
  }
  if (!data.operation) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Calendar node: Operation is required");
  }

  try {
    const result = await step.run("google-calendar-op", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });
      if (!credential) throw new NonRetriableError("Google Calendar node: Credential not found");

      const token = decrypt(credential.value);
      const headers = { Authorization: `Bearer ${token}` };
      const calendarId = data.calendarId
        ? Handlebars.compile(data.calendarId)(context)
        : "primary";

      let responseData: unknown;

      switch (data.operation) {
        case "list_events": {
          const searchParams: Record<string, string> = { singleEvents: "true", orderBy: "startTime" };
          if (data.timeMin) searchParams.timeMin = Handlebars.compile(data.timeMin)(context);
          if (data.timeMax) searchParams.timeMax = Handlebars.compile(data.timeMax)(context);

          responseData = await ky
            .get(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
              headers,
              searchParams,
            })
            .json();
          break;
        }

        case "create_event": {
          if (!data.summary) throw new NonRetriableError("Google Calendar node: Summary is required");
          if (!data.startTime || !data.endTime)
            throw new NonRetriableError("Google Calendar node: Start and end time are required");

          const summary = Handlebars.compile(data.summary)(context);
          const description = data.description
            ? Handlebars.compile(data.description)(context)
            : undefined;
          const startTime = Handlebars.compile(data.startTime)(context);
          const endTime = Handlebars.compile(data.endTime)(context);

          responseData = await ky
            .post(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
              headers: { ...headers, "Content-Type": "application/json" },
              json: {
                summary,
                description,
                start: { dateTime: startTime },
                end: { dateTime: endTime },
              },
            })
            .json();
          break;
        }

        case "delete_event": {
          if (!data.eventId) throw new NonRetriableError("Google Calendar node: Event ID is required");
          const eventId = Handlebars.compile(data.eventId)(context);

          await ky.delete(
            `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
            { headers },
          );
          responseData = { deleted: true, eventId };
          break;
        }

        default:
          throw new NonRetriableError(`Google Calendar node: Unknown operation "${data.operation}"`);
      }

      return { ...context, [data.variableName!]: responseData };
    });

    await publish(googleServicesChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
