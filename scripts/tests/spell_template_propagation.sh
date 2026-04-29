#!/bin/bash
# Regression test for the UNIFIED Roll Templates feature (AAv2):
#   * Templates live in items.is_live_template = true
#   * Both items and spells link via their respective join tables
#   * Edits to a template's rolls fan out to ALL linked items + linked spells
#     (including character-owned copies via provenance)
#   * Deleting a template scrubs every inherited roll on items AND spells
set -e
BASE="http://localhost:5000/api"
TS=$(date +%s)
ADMIN_JAR=$(mktemp)
ADMIN_EMAIL="char_admin_unified_${TS}@example.com"

curl -s -c "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/register" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"TestPass123!\",\"username\":\"adms$TS\",\"name\":\"A\"}" >/dev/null
psql "$DATABASE_URL" -c "UPDATE users SET is_admin = true WHERE email = '$ADMIN_EMAIL';" >/dev/null
> "$ADMIN_JAR"
curl -s -c "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/login" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"TestPass123!\"}" >/dev/null
ADMIN_USER_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM users WHERE email='$ADMIN_EMAIL';" | tr -d ' \n')

echo "== admin creates UNIFIED Roll Template TPL with R1 =="
TPL=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/item-templates" \
  -d '{"name":"UnifiedTpl","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
TPL_R1=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL\",\"name\":\"R1\",\"diceFormula\":\"1d4\",\"rollType\":\"damage\",\"sortOrder\":0}" | jq -r .id)
echo "TPL=$TPL R1=$TPL_R1"

echo "== seed character + character-owned spell linked to the unified TPL =="
CHAR=$(psql "$DATABASE_URL" -A -t -c "INSERT INTO characters (id, user_id, name, hp, max_hp, energy, max_energy) VALUES (gen_random_uuid()::text, '$ADMIN_USER_ID', 'UnifiedHero', 10, 10, 5, 5) RETURNING id;" | head -1 | tr -d ' \n\r')
PC_SPELL=$(psql "$DATABASE_URL" -A -t -c "INSERT INTO spells (id, character_id, name, system) VALUES (gen_random_uuid()::text, '$CHAR', 'CharSpell', 'aa-v2') RETURNING id;" | head -1 | tr -d ' \n\r')
psql "$DATABASE_URL" -c "INSERT INTO spell_template_links (spell_id, template_id) VALUES ('$PC_SPELL', '$TPL');" >/dev/null
# Manually copy R1 onto the PC spell with provenance to mimic the link-time copy.
psql "$DATABASE_URL" -c "INSERT INTO roll_entries (id, owner_type, owner_id, name, dice_formula, roll_type, sort_order, from_template_roll_id) VALUES (gen_random_uuid()::text, 'spell', '$PC_SPELL', 'R1', '1d4', 'damage', 0, '$TPL_R1');" >/dev/null
echo "CHAR=$CHAR PC_SPELL=$PC_SPELL"

echo "== admin adds R2 to template -> must fan out to character spell (cross-owner-type) =="
TPL_R2=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL\",\"name\":\"R2\",\"diceFormula\":\"2d6\",\"rollType\":\"damage\",\"sortOrder\":1}" | jq -r .id)
echo "TPL_R2=$TPL_R2"
echo "Character spell rolls (must include R2):"
psql "$DATABASE_URL" -c "SELECT name, dice_formula, from_template_roll_id FROM roll_entries WHERE owner_id='$PC_SPELL' ORDER BY sort_order;"

echo "== admin DELETES unified template -> all inherited rolls on PC spell must be cleaned =="
curl -s -b "$ADMIN_JAR" -X DELETE "$BASE/admin/item-templates/$TPL" | jq
echo "Character spell rolls AFTER template delete (must be empty):"
psql "$DATABASE_URL" -c "SELECT name, dice_formula, from_template_roll_id FROM roll_entries WHERE owner_id='$PC_SPELL' ORDER BY sort_order;"
echo "spell_template_links rows for PC spell AFTER delete (must be empty via cascade):"
psql "$DATABASE_URL" -c "SELECT count(*) FROM spell_template_links WHERE spell_id='$PC_SPELL';"

echo ""
echo "================================================="
echo "== Multi-template add/remove idempotency (spell ↔ unified templates) =="
echo "================================================="
TPL_A=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/item-templates" \
  -d '{"name":"UnifiedIdemA","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
TPL_B=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/item-templates" \
  -d '{"name":"UnifiedIdemB","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL_A\",\"name\":\"AR\",\"diceFormula\":\"1d4\",\"rollType\":\"damage\",\"sortOrder\":0}" >/dev/null
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL_B\",\"name\":\"BR\",\"diceFormula\":\"1d6\",\"rollType\":\"damage\",\"sortOrder\":0}" >/dev/null
SPELL=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/spells" \
  -d '{"name":"IdemSpell","system":"aa-v2"}' | jq -r .id)

echo "-- PUT [A,B] x3 (idempotent): each call must yield exactly 2 inherited rolls --"
for i in 1 2 3; do
  curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/spells/$SPELL/template-links" \
    -d "{\"templateIds\":[\"$TPL_A\",\"$TPL_B\"]}" >/dev/null
  COUNT=$(curl -s -b "$ADMIN_JAR" "$BASE/spells/$SPELL/rolls" | jq '[.[] | select(.fromTemplateRollId != null)] | length')
  echo "iter $i: inherited rolls = $COUNT (expected 2)"
done

echo "-- PUT [A] : remove B, A's roll must persist (1 inherited) --"
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/spells/$SPELL/template-links" \
  -d "{\"templateIds\":[\"$TPL_A\"]}" >/dev/null
COUNT=$(curl -s -b "$ADMIN_JAR" "$BASE/spells/$SPELL/rolls" | jq '[.[] | select(.fromTemplateRollId != null)] | length')
echo "after remove B: inherited rolls = $COUNT (expected 1)"

echo "-- PUT [] : remove all --"
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/spells/$SPELL/template-links" \
  -d '{"templateIds":[]}' >/dev/null
COUNT=$(curl -s -b "$ADMIN_JAR" "$BASE/spells/$SPELL/rolls" | jq '[.[] | select(.fromTemplateRollId != null)] | length')
echo "after remove all: inherited rolls = $COUNT (expected 0)"

echo ""
echo "================================================="
echo "== UNIFICATION CHECK: one template, both an item AND a spell link to it =="
echo "================================================="
TPL_U=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/item-templates" \
  -d '{"name":"DualLinkTpl","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
TPL_U_R1=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL_U\",\"name\":\"DR1\",\"diceFormula\":\"1d8\",\"rollType\":\"damage\",\"sortOrder\":0}" | jq -r .id)
ITEM_U=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/system-items" \
  -d '{"name":"DualLinkItem","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/items/$ITEM_U/template-links" \
  -d "{\"templateIds\":[\"$TPL_U\"]}" >/dev/null
SPELL_U=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/spells" \
  -d '{"name":"DualLinkSpell","system":"aa-v2"}' | jq -r .id)
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/spells/$SPELL_U/template-links" \
  -d "{\"templateIds\":[\"$TPL_U\"]}" >/dev/null

echo "Item rolls (should have DR1 inherited):"
curl -s -b "$ADMIN_JAR" "$BASE/items/$ITEM_U/rolls" | jq '[.[] | {name, fromTemplateRollId}]'
echo "Spell rolls (should have DR1 inherited):"
curl -s -b "$ADMIN_JAR" "$BASE/spells/$SPELL_U/rolls" | jq '[.[] | {name, fromTemplateRollId}]'

echo "== Add DR2 to template -> must propagate to BOTH item and spell =="
TPL_U_R2=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL_U\",\"name\":\"DR2\",\"diceFormula\":\"2d4\",\"rollType\":\"damage\",\"sortOrder\":1}" | jq -r .id)
ITEM_INH=$(curl -s -b "$ADMIN_JAR" "$BASE/items/$ITEM_U/rolls" | jq '[.[] | select(.fromTemplateRollId != null)] | length')
SPELL_INH=$(curl -s -b "$ADMIN_JAR" "$BASE/spells/$SPELL_U/rolls" | jq '[.[] | select(.fromTemplateRollId != null)] | length')
echo "item inherited rolls = $ITEM_INH (expected 2)"
echo "spell inherited rolls = $SPELL_INH (expected 2)"

echo ""
echo "Done."

echo ""
echo "================================================="
echo "== EDIT/DELETE roll fan-out for spell-linked unified templates =="
echo "================================================="
TPL_E=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/item-templates" \
  -d '{"name":"EditTpl","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
TPL_E_R=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL_E\",\"name\":\"ER1\",\"diceFormula\":\"1d4\",\"rollType\":\"damage\",\"sortOrder\":0}" | jq -r .id)
SPELL_E=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/spells" \
  -d '{"name":"EditSpell","system":"aa-v2"}' | jq -r .id)
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/spells/$SPELL_E/template-links" \
  -d "{\"templateIds\":[\"$TPL_E\"]}" >/dev/null

echo "-- EDIT template roll: change diceFormula 1d4 -> 4d12 --"
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PATCH "$BASE/roll-entries/$TPL_E_R" \
  -d '{"diceFormula":"4d12"}' >/dev/null
SPELL_FORMULA=$(curl -s -b "$ADMIN_JAR" "$BASE/spells/$SPELL_E/rolls" | jq -r '.[0].diceFormula')
echo "spell inherited diceFormula = $SPELL_FORMULA (expected 4d12)"

echo "-- DELETE template roll: ER1 must vanish from spell --"
curl -s -b "$ADMIN_JAR" -X DELETE "$BASE/roll-entries/$TPL_E_R" >/dev/null
SPELL_INH_AFTER=$(curl -s -b "$ADMIN_JAR" "$BASE/spells/$SPELL_E/rolls" | jq '[.[] | select(.fromTemplateRollId != null)] | length')
echo "spell inherited rolls after template-roll delete = $SPELL_INH_AFTER (expected 0)"
