import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, integration_id, ...params } = await req.json();

    console.log(`[google-calendar] Action: ${action}`);

    // Get integration and validate token
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (intError || !integration) {
      console.error("[google-calendar] Integration not found:", intError);
      return new Response(
        JSON.stringify({ error: "Integração não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = integration.config as Record<string, string>;
    let accessToken = config?.access_token;
    const expiresAt = config?.expires_at;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Conta Google não conectada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired and refresh if needed
    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.log("[google-calendar] Token expired, refreshing...");
      
      const refreshResponse = await supabase.functions.invoke("google-auth", {
        body: { action: "refresh", integration_id },
      });

      if (refreshResponse.error) {
        return new Response(
          JSON.stringify({ error: "Erro ao renovar token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      accessToken = refreshResponse.data.access_token;
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    switch (action) {
      case "list-calendars": {
        const response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
          headers,
        });

        const data = await response.json();

        if (!response.ok) {
          console.error("[google-calendar] List calendars error:", data);
          return new Response(
            JSON.stringify({ error: data.error?.message || "Erro ao listar calendários" }),
            { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const calendars = data.items?.map((cal: any) => ({
          id: cal.id,
          summary: cal.summary,
          description: cal.description,
          primary: cal.primary || false,
          backgroundColor: cal.backgroundColor,
        })) || [];

        return new Response(
          JSON.stringify({ calendars }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list-events": {
        const { calendar_id, time_min, time_max, max_results = 50 } = params;
        const calendarId = calendar_id || "primary";

        const queryParams = new URLSearchParams({
          timeMin: time_min || new Date().toISOString(),
          timeMax: time_max || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          maxResults: String(max_results),
          singleEvents: "true",
          orderBy: "startTime",
        });

        const response = await fetch(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${queryParams}`,
          { headers }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("[google-calendar] List events error:", data);
          return new Response(
            JSON.stringify({ error: data.error?.message || "Erro ao listar eventos" }),
            { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const events = data.items?.map((event: any) => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          status: event.status,
        })) || [];

        return new Response(
          JSON.stringify({ events }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "check-availability": {
        const { 
          calendar_id, 
          date, 
          service_duration = 60, 
          working_hours_start = "09:00",
          working_hours_end = "18:00"
        } = params;
        
        const calendarId = calendar_id || config.selected_calendar_id || "primary";
        
        // Parse date
        const targetDate = date ? new Date(date) : new Date();
        targetDate.setHours(0, 0, 0, 0);
        
        const timeMin = new Date(targetDate);
        const [startHour, startMin] = working_hours_start.split(":").map(Number);
        timeMin.setHours(startHour, startMin, 0, 0);
        
        const timeMax = new Date(targetDate);
        const [endHour, endMin] = working_hours_end.split(":").map(Number);
        timeMax.setHours(endHour, endMin, 0, 0);

        // Get events for the day
        const queryParams = new URLSearchParams({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
        });

        const response = await fetch(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${queryParams}`,
          { headers }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("[google-calendar] Check availability error:", data);
          return new Response(
            JSON.stringify({ error: data.error?.message || "Erro ao verificar disponibilidade" }),
            { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Calculate available slots
        const events = data.items || [];
        const busySlots = events.map((event: any) => ({
          start: new Date(event.start?.dateTime || event.start?.date).getTime(),
          end: new Date(event.end?.dateTime || event.end?.date).getTime(),
        }));

        const availableSlots: { start: string; end: string }[] = [];
        const slotDuration = service_duration * 60 * 1000; // Convert to ms
        
        let currentTime = timeMin.getTime();
        const endTime = timeMax.getTime();

        while (currentTime + slotDuration <= endTime) {
          const slotEnd = currentTime + slotDuration;
          
          // Check if slot conflicts with any busy period
          const hasConflict = busySlots.some(
            (busy: { start: number; end: number }) =>
              (currentTime >= busy.start && currentTime < busy.end) ||
              (slotEnd > busy.start && slotEnd <= busy.end) ||
              (currentTime <= busy.start && slotEnd >= busy.end)
          );

          if (!hasConflict) {
            availableSlots.push({
              start: new Date(currentTime).toISOString(),
              end: new Date(slotEnd).toISOString(),
            });
          }

          // Move to next slot (30 min intervals)
          currentTime += 30 * 60 * 1000;
        }

        return new Response(
          JSON.stringify({ 
            date: targetDate.toISOString().split("T")[0],
            available_slots: availableSlots,
            total_slots: availableSlots.length,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create-event": {
        const { 
          calendar_id, 
          title, 
          description, 
          start_time, 
          end_time,
          attendees,
          contact_id,
          conversation_id,
        } = params;
        
        const calendarId = calendar_id || config.selected_calendar_id || "primary";

        const eventData: Record<string, unknown> = {
          summary: title,
          description: description || "",
          start: {
            dateTime: start_time,
            timeZone: "America/Sao_Paulo",
          },
          end: {
            dateTime: end_time,
            timeZone: "America/Sao_Paulo",
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "email", minutes: 60 },
              { method: "popup", minutes: 30 },
            ],
          },
        };

        if (attendees?.length) {
          eventData.attendees = attendees.map((email: string) => ({ email }));
        }

        const response = await fetch(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(eventData),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("[google-calendar] Create event error:", data);
          return new Response(
            JSON.stringify({ error: data.error?.message || "Erro ao criar evento" }),
            { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log("[google-calendar] Event created:", data.id);

        // Save event reference in our database
        if (contact_id || conversation_id) {
          await supabase.from("google_calendar_events").insert({
            integration_id,
            google_event_id: data.id,
            contact_id,
            conversation_id,
            title,
            description,
            start_time,
            end_time,
            status: "confirmed",
          });
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            event_id: data.id,
            html_link: data.htmlLink,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete-event": {
        const { calendar_id, event_id } = params;
        const calendarId = calendar_id || config.selected_calendar_id || "primary";

        const response = await fetch(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${event_id}`,
          {
            method: "DELETE",
            headers,
          }
        );

        if (!response.ok && response.status !== 204) {
          const data = await response.json();
          console.error("[google-calendar] Delete event error:", data);
          return new Response(
            JSON.stringify({ error: data.error?.message || "Erro ao excluir evento" }),
            { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update our database
        await supabase
          .from("google_calendar_events")
          .update({ status: "cancelled" })
          .eq("google_event_id", event_id);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Ação inválida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("[google-calendar] Error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
