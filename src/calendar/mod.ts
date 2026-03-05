import { CalDAVClient, GoogleCalendarClient } from "@tijs/deno-calendar";
import type { CalDAVConfig, CalendarConfig, GoogleCalendarConfig } from "../config/types.ts";

export interface CalendarEvent {
  id: string;
  uid: string;
  summary: string;
  description: string | null;
  start: string;
  end: string | null;
  location: string | null;
  timezone: string | undefined;
  etag: string | undefined;
  eventUrl: string | undefined;
}

export interface CreateEventInput {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  timezone?: string;
}

export interface UpdateEventInput {
  eventUrl: string;
  etag: string;
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  timezone?: string;
}

export interface CalendarInfo {
  url: string;
  name: string;
}

type CalendarClient = CalDAVClient | GoogleCalendarClient;

export class CalendarService {
  private caldavClient: CalDAVClient | null = null;
  private googleClient: GoogleCalendarClient | null = null;
  private defaultCalendar: string | undefined;

  constructor(config: CalendarConfig) {
    if (config.caldav) {
      this.caldavClient = this.createCalDAVClient(config.caldav);
      this.defaultCalendar = config.caldav.defaultCalendar;
    }
    if (config.google) {
      this.googleClient = this.createGoogleClient(config.google);
      this.defaultCalendar = config.google.defaultCalendar;
    }
  }

  private createCalDAVClient(config: CalDAVConfig): CalDAVClient {
    const isICloud = config.serverUrl.includes("icloud.com");

    if (isICloud) {
      return new CalDAVClient({
        appleId: config.username,
        appPassword: config.password,
      });
    }

    return new CalDAVClient({
      appleId: config.username,
      appPassword: config.password,
    });
  }

  private createGoogleClient(config: GoogleCalendarConfig): GoogleCalendarClient {
    return new GoogleCalendarClient({
      accessToken: config.accessToken,
    });
  }

  private getActiveClient(): { client: CalendarClient; type: "caldav" | "google" } | null {
    if (this.caldavClient) {
      return { client: this.caldavClient, type: "caldav" };
    }
    if (this.googleClient) {
      return { client: this.googleClient, type: "google" };
    }
    return null;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const active = this.getActiveClient();
    if (!active) {
      throw new Error("No calendar client configured");
    }

    const { client, type } = active;

    if (type === "caldav") {
      const calendars = await (client as CalDAVClient).fetchCalendars();
      return calendars.map((cal: { url: string; displayName: string }) => ({
        url: cal.url,
        name: cal.displayName,
      }));
    } else {
      return [{
        url: "primary",
        name: "Primary Calendar",
      }];
    }
  }

  async getEvents(options?: {
    startDate?: string;
    endDate?: string;
    days?: number;
    calendar?: string;
  }): Promise<CalendarEvent[]> {
    const active = this.getActiveClient();
    if (!active) {
      throw new Error("No calendar client configured");
    }

    const { client, type } = active;
    const calendar = options?.calendar || this.defaultCalendar;

    if (type === "caldav") {
      const caldavClient = client as CalDAVClient;
      const days = options?.days || 7;

      const calendars = await caldavClient.fetchCalendars();
      const targetCal = calendar
        ? calendars.find((c: { displayName: string }) => c.displayName === calendar)
        : calendars[0];

      if (!targetCal) {
        return [];
      }

      const events = await caldavClient.fetchEvents(days, calendar || null);

      return events.map(
        (
          event: {
            uid: string;
            summary: string;
            start: string;
            end: string | null;
            description: string | null;
            location: string | null;
            timezone?: string;
            etag?: string;
          },
        ) => {
          const calUrl = targetCal.url.endsWith("/") ? targetCal.url : `${targetCal.url}/`;
          const eventUrl = event.uid ? `${calUrl}${event.uid}.ics` : undefined;
          return {
            id: event.uid,
            uid: event.uid,
            summary: event.summary,
            description: event.description,
            start: event.start,
            end: event.end,
            location: event.location,
            timezone: event.timezone,
            etag: event.etag,
            eventUrl,
          };
        },
      );
    } else {
      const googleClient = client as GoogleCalendarClient;
      const events = await googleClient.fetchEvents({
        days: options?.days || 7,
        calendar: calendar || "primary",
      });

      return events.map((
        event: {
          uid: string;
          summary: string;
          start: string;
          end: string | null;
          description: string | null;
          location: string | null;
          timezone?: string;
        },
      ) => ({
        id: event.uid,
        uid: event.uid,
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        location: event.location,
        timezone: event.timezone,
        etag: undefined,
        eventUrl: event.uid,
      }));
    }
  }

  async createEvent(input: CreateEventInput, calendar?: string): Promise<CalendarEvent> {
    const active = this.getActiveClient();
    if (!active) {
      throw new Error("No calendar client configured");
    }

    const { client, type } = active;
    const targetCalendar = calendar || this.defaultCalendar;

    if (type === "caldav") {
      const caldavClient = client as CalDAVClient;
      const calendars = await caldavClient.fetchCalendars();
      const calUrl = targetCalendar
        ? calendars.find((c: { displayName: string }) => c.displayName === targetCalendar)?.url
        : calendars[0]?.url;

      if (!calUrl) {
        throw new Error("No calendar available");
      }

      const normalizedCalUrl = calUrl.endsWith("/") ? calUrl : `${calUrl}/`;

      const eventInput = {
        summary: input.summary,
        start: input.start,
        end: input.end,
        ...(input.description && { description: input.description }),
        ...(input.location && { location: input.location }),
        ...(input.timezone && { timezone: input.timezone }),
      };

      const result = await caldavClient.createEvent(normalizedCalUrl, eventInput);

      const newEvent: CalendarEvent = {
        id: result.uid,
        uid: result.uid,
        summary: input.summary,
        description: input.description || null,
        start: input.start,
        end: input.end,
        location: input.location || null,
        timezone: input.timezone,
        etag: result.etag,
        eventUrl: `${normalizedCalUrl}${result.uid}.ics`,
      };

      return newEvent;
    } else {
      const googleClient = client as GoogleCalendarClient;
      const eventInput = {
        summary: input.summary,
        start: input.start,
        end: input.end,
        ...(input.description && { description: input.description }),
        ...(input.location && { location: input.location }),
        ...(input.timezone && { timezone: input.timezone }),
      };

      const result = await googleClient.createEvent(targetCalendar || "primary", eventInput);

      const newEvent: CalendarEvent = {
        id: result.uid,
        uid: result.uid,
        summary: input.summary,
        description: input.description || null,
        start: input.start,
        end: input.end,
        location: input.location || null,
        timezone: input.timezone,
        etag: undefined,
        eventUrl: result.uid,
      };

      return newEvent;
    }
  }

  async updateEvent(input: UpdateEventInput, calendar?: string): Promise<CalendarEvent> {
    const active = this.getActiveClient();
    if (!active) {
      throw new Error("No calendar client configured");
    }

    const { client, type } = active;
    const targetCalendar = calendar || this.defaultCalendar;

    if (type === "caldav") {
      const caldavClient = client as CalDAVClient;

      const eventInput: {
        summary: string;
        start: string;
        end: string;
        description?: string;
        location?: string;
        timezone?: string;
      } = {
        summary: input.summary,
        start: input.start,
        end: input.end,
      };

      if (input.description) eventInput.description = input.description;
      if (input.location) eventInput.location = input.location;
      if (input.timezone) eventInput.timezone = input.timezone;

      const result = await caldavClient.updateEvent(input.eventUrl, eventInput, input.etag);

      return {
        id: input.eventUrl.split("/").pop()?.replace(".ics", "") || "",
        uid: input.eventUrl.split("/").pop()?.replace(".ics", "") || "",
        summary: input.summary,
        description: input.description || null,
        start: input.start,
        end: input.end,
        location: input.location || null,
        timezone: input.timezone,
        etag: result.etag,
        eventUrl: input.eventUrl,
      };
    } else {
      const googleClient = client as GoogleCalendarClient;

      const eventInput: {
        summary: string;
        start: string;
        end: string;
        description?: string;
        location?: string;
        timezone?: string;
      } = {
        summary: input.summary,
        start: input.start,
        end: input.end,
      };

      if (input.description) eventInput.description = input.description;
      if (input.location) eventInput.location = input.location;
      if (input.timezone) eventInput.timezone = input.timezone;

      const eventId = input.eventUrl;
      const result = await googleClient.updateEvent(
        targetCalendar || "primary",
        eventId,
        eventInput,
      );

      return {
        id: eventId,
        uid: eventId,
        summary: input.summary,
        description: input.description || null,
        start: input.start,
        end: input.end,
        location: input.location || null,
        timezone: input.timezone,
        etag: result.etag,
        eventUrl: eventId,
      };
    }
  }

  async deleteEvent(eventUrl: string, etag: string): Promise<void> {
    const active = this.getActiveClient();
    if (!active) {
      throw new Error("No calendar client configured");
    }

    const { client, type } = active;

    if (type === "caldav") {
      const caldavClient = client as CalDAVClient;
      await caldavClient.deleteEvent(eventUrl, etag);
    } else {
      const googleClient = client as GoogleCalendarClient;
      const eventId = eventUrl;
      await googleClient.deleteEvent("primary", eventId);
    }
  }
}

export function createCalendarService(config: CalendarConfig): CalendarService {
  return new CalendarService(config);
}
