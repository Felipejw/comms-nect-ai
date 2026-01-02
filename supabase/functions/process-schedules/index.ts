import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Processing schedules at:", new Date().toISOString());

    // Fetch pending schedules that are due
    const { data: pendingSchedules, error: fetchError } = await supabase
      .from("schedules")
      .select(`
        *,
        conversation:conversations (
          id,
          contact:contacts (
            id,
            name,
            phone
          )
        )
      `)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString());

    if (fetchError) {
      console.error("Error fetching schedules:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${pendingSchedules?.length || 0} pending schedules to process`);

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const schedule of pendingSchedules || []) {
      try {
        console.log(`Processing schedule ${schedule.id}: "${schedule.title}"`);

        // If there's a conversation with message_content, send the message
        if (
          schedule.conversation_id &&
          schedule.message_content &&
          schedule.conversation?.contact?.phone &&
          evolutionApiUrl &&
          evolutionApiKey
        ) {
          const phone = schedule.conversation.contact.phone.replace(/\D/g, "");

          // Get default connection
          const { data: connection } = await supabase
            .from("connections")
            .select("name")
            .eq("is_default", true)
            .eq("status", "connected")
            .single();

          if (connection) {
            console.log(`Sending message to ${phone} via instance ${connection.name}`);

            const messageResponse = await fetch(
              `${evolutionApiUrl}/message/sendText/${connection.name}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: evolutionApiKey,
                },
                body: JSON.stringify({
                  number: phone,
                  text: schedule.message_content,
                }),
              }
            );

            if (!messageResponse.ok) {
              const errorText = await messageResponse.text();
              console.error(`Failed to send message for schedule ${schedule.id}:`, errorText);
            } else {
              console.log(`Message sent successfully for schedule ${schedule.id}`);

              // Save message to database
              await supabase.from("messages").insert({
                conversation_id: schedule.conversation_id,
                content: schedule.message_content,
                sender_type: "agent",
                message_type: "text",
              });
            }
          } else {
            console.log(`No default connection found for schedule ${schedule.id}`);
          }
        }

        // Mark schedule as completed
        const { error: updateError } = await supabase
          .from("schedules")
          .update({
            status: "completed",
            reminder_sent: true,
          })
          .eq("id", schedule.id);

        if (updateError) {
          throw updateError;
        }

        results.push({ id: schedule.id, success: true });
        console.log(`Schedule ${schedule.id} marked as completed`);
      } catch (scheduleError) {
        console.error(`Error processing schedule ${schedule.id}:`, scheduleError);
        results.push({
          id: schedule.id,
          success: false,
          error: scheduleError instanceof Error ? scheduleError.message : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in process-schedules:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
