-- ============================================================
-- Migration 061: Allow 'appointment_form' in flow_nodes.node_type
-- ============================================================

ALTER TABLE flow_nodes
  DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;

ALTER TABLE flow_nodes
  ADD CONSTRAINT flow_nodes_node_type_check
  CHECK (node_type IN (
    'start',
    'send_buttons',
    'send_list',
    'send_message',
    'send_media',
    'collect_input',
    'appointment_form',
    'condition',
    'set_tag',
    'handoff',
    'http_fetch',
    'end'
  ));
