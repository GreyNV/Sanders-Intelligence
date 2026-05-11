-- Migration 003: Allow overstock action dismissals
-- Run in Supabase SQL Editor after 002_dismissed_actions.sql

alter table public.dismissed_actions
  drop constraint if exists dismissed_actions_action_type_check;

alter table public.dismissed_actions
  add constraint dismissed_actions_action_type_check
  check (action_type in ('at_risk', 'backorder', 'overstock'));
