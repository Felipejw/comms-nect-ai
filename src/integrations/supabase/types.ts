export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean | null
          knowledge_base: string | null
          max_tokens: number | null
          model: string | null
          name: string
          system_prompt: string | null
          temperature: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          knowledge_base?: string | null
          max_tokens?: number | null
          model?: string | null
          name?: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          knowledge_base?: string | null
          max_tokens?: number | null
          model?: string | null
          name?: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          permissions?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: Json | null
        }
        Relationships: []
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          delivered_at: string | null
          id: string
          read_at: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          delivered_count: number | null
          description: string | null
          failed_count: number | null
          id: string
          media_url: string | null
          message: string
          name: string
          read_count: number | null
          scheduled_at: string | null
          sent_count: number | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string
          media_url?: string | null
          message: string
          name: string
          read_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string
          media_url?: string | null
          message?: string
          name?: string
          read_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      chatbot_flows: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          trigger_type: string | null
          trigger_value: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          trigger_type?: string | null
          trigger_value?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          trigger_type?: string | null
          trigger_value?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chatbot_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          match_count: number | null
          match_type: string | null
          priority: number | null
          queue_id: string | null
          response: string
          trigger_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          match_count?: number | null
          match_type?: string | null
          priority?: number | null
          queue_id?: string | null
          response: string
          trigger_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          match_count?: number | null
          match_type?: string | null
          priority?: number | null
          queue_id?: string | null
          response?: string
          trigger_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_rules_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          color: string | null
          created_at: string
          disconnect_requested: boolean | null
          id: string
          is_default: boolean | null
          name: string
          phone_number: string | null
          qr_code: string | null
          session_data: Json | null
          status: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          disconnect_requested?: boolean | null
          id?: string
          is_default?: boolean | null
          name: string
          phone_number?: string | null
          qr_code?: string | null
          session_data?: Json | null
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          disconnect_requested?: boolean | null
          id?: string
          is_default?: boolean | null
          name?: string
          phone_number?: string | null
          qr_code?: string | null
          session_data?: Json | null
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          kanban_stage: Database["public"]["Enums"]["kanban_stage"] | null
          last_contact_at: string | null
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["contact_status"]
          updated_at: string
          whatsapp_lid: string | null
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kanban_stage?: Database["public"]["Enums"]["kanban_stage"] | null
          last_contact_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          updated_at?: string
          whatsapp_lid?: string | null
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kanban_stage?: Database["public"]["Enums"]["kanban_stage"] | null
          last_contact_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          updated_at?: string
          whatsapp_lid?: string | null
        }
        Relationships: []
      }
      conversation_tags: {
        Row: {
          conversation_id: string
          created_at: string | null
          id: string
          tag_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          id?: string
          tag_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          active_flow_id: string | null
          assigned_to: string | null
          channel: string | null
          connection_id: string | null
          contact_id: string
          created_at: string
          flow_state: Json | null
          id: string
          is_bot_active: boolean | null
          kanban_column_id: string | null
          last_message_at: string | null
          priority: number | null
          queue_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          active_flow_id?: string | null
          assigned_to?: string | null
          channel?: string | null
          connection_id?: string | null
          contact_id: string
          created_at?: string
          flow_state?: Json | null
          id?: string
          is_bot_active?: boolean | null
          kanban_column_id?: string | null
          last_message_at?: string | null
          priority?: number | null
          queue_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          active_flow_id?: string | null
          assigned_to?: string | null
          channel?: string | null
          connection_id?: string | null
          contact_id?: string
          created_at?: string
          flow_state?: Json | null
          id?: string
          is_bot_active?: boolean | null
          kanban_column_id?: string | null
          last_message_at?: string | null
          priority?: number | null
          queue_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_active_flow_id_fkey"
            columns: ["active_flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_kanban_column_id_fkey"
            columns: ["kanban_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_edges: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          label: string | null
          source_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          label?: string | null
          source_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          label?: string | null
          source_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_edges_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "flow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "flow_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_nodes: {
        Row: {
          created_at: string
          data: Json | null
          flow_id: string
          id: string
          position_x: number | null
          position_y: number | null
          type: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          flow_id: string
          id?: string
          position_x?: number | null
          position_y?: number | null
          type: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          flow_id?: string
          id?: string
          position_x?: number | null
          position_y?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_events: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          description: string | null
          end_time: string
          google_event_id: string
          id: string
          integration_id: string | null
          start_time: string
          status: string | null
          title: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          end_time: string
          google_event_id: string
          id?: string
          integration_id?: string | null
          start_time: string
          status?: string | null
          title: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string
          google_event_id?: string
          id?: string
          integration_id?: string | null
          start_time?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      kanban_columns: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          position: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          position?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          position?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean | null
          media_url: string | null
          message_type: Database["public"]["Enums"]["message_type"]
          sender_id: string | null
          sender_type: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type"]
          sender_id?: string | null
          sender_type?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type"]
          sender_id?: string | null
          sender_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          is_online: boolean | null
          last_seen: string | null
          name: string
          phone: string | null
          signature_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id?: string
          is_online?: boolean | null
          last_seen?: string | null
          name: string
          phone?: string | null
          signature_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          is_online?: boolean | null
          last_seen?: string | null
          name?: string
          phone?: string | null
          signature_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      queue_agents: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          queue_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          queue_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          queue_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_agents_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queues: {
        Row: {
          auto_assign: boolean | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          max_concurrent: number | null
          name: string
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          auto_assign?: boolean | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          max_concurrent?: number | null
          name: string
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          auto_assign?: boolean | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          max_concurrent?: number | null
          name?: string
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          message: string
          shortcut: string
          title: string
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          shortcut: string
          title: string
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          shortcut?: string
          title?: string
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      schedules: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          description: string | null
          id: string
          message_content: string | null
          reminder: boolean | null
          reminder_sent: boolean | null
          scheduled_at: string
          status: Database["public"]["Enums"]["schedule_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          message_content?: string | null
          reminder?: boolean | null
          reminder_sent?: boolean | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["schedule_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          message_content?: string | null
          reminder?: boolean | null
          reminder_sent?: boolean | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["schedule_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_edit: boolean | null
          can_view: boolean | null
          created_at: string | null
          id: string
          module: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          module: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          module?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
      normalize_phone: { Args: { phone_input: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "manager" | "operator"
      campaign_status: "draft" | "active" | "paused" | "completed"
      contact_status: "active" | "inactive"
      conversation_status: "new" | "in_progress" | "resolved" | "archived"
      kanban_stage:
        | "lead"
        | "contacted"
        | "proposal"
        | "negotiation"
        | "closed_won"
        | "closed_lost"
      message_type: "text" | "image" | "audio" | "document" | "video"
      queue_status: "active" | "paused"
      schedule_status: "pending" | "completed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "operator"],
      campaign_status: ["draft", "active", "paused", "completed"],
      contact_status: ["active", "inactive"],
      conversation_status: ["new", "in_progress", "resolved", "archived"],
      kanban_stage: [
        "lead",
        "contacted",
        "proposal",
        "negotiation",
        "closed_won",
        "closed_lost",
      ],
      message_type: ["text", "image", "audio", "document", "video"],
      queue_status: ["active", "paused"],
      schedule_status: ["pending", "completed", "cancelled"],
    },
  },
} as const
