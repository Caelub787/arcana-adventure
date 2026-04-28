#!/bin/bash
# Regression test: character-owned propagation for AAv2 multi-link templates.
# Uses direct SQL to set up a character + linked character item, then exercises
# the template-roll propagation HTTP paths and verifies via DB queries.
set -e
BASE="http://localhost:5000/api"
TS=$(date +%s)
ADMIN_JAR=$(mktemp)
ADMIN_EMAIL="char_admin_${TS}@example.com"

curl -s -c "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/register" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"TestPass123!\",\"username\":\"adm$TS\",\"name\":\"A\"}" >/dev/null
psql "$DATABASE_URL" -c "UPDATE users SET is_admin = true WHERE email = '$ADMIN_EMAIL';" >/dev/null
> "$ADMIN_JAR"
curl -s -c "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/login" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"TestPass123!\"}" >/dev/null
ADMIN_USER_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM users WHERE email='$ADMIN_EMAIL';" | tr -d ' \n')

echo "== admin creates template TPL with R1 =="
TPL=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/item-templates" \
  -d '{"name":"CharTpl","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
TPL_R1=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL\",\"name\":\"R1\",\"diceFormula\":\"1d4\",\"rollType\":\"damage\",\"sortOrder\":0}" | jq -r .id)
echo "TPL=$TPL R1=$TPL_R1"

echo "== seed a character + character-owned item linked to TPL via SQL =="
CHAR=$(psql "$DATABASE_URL" -A -t -c "INSERT INTO characters (id, user_id, name, hp, max_hp, energy, max_energy) VALUES (gen_random_uuid()::text, '$ADMIN_USER_ID', 'Hero', 10, 10, 5, 5) RETURNING id;" | head -1 | tr -d ' \n\r')
PC_ITEM=$(psql "$DATABASE_URL" -A -t -c "INSERT INTO items (id, character_id, name, system, item_type, rarity, template_item_id) VALUES (gen_random_uuid()::text, '$CHAR', 'CharItem', 'aa-v2', 'weapon', 'common', '$TPL') RETURNING id;" | head -1 | tr -d ' \n\r')
# Manually copy R1 onto the PC item with provenance to mimic prior add flow.
psql "$DATABASE_URL" -c "INSERT INTO roll_entries (id, owner_type, owner_id, name, dice_formula, roll_type, sort_order, from_template_roll_id) VALUES (gen_random_uuid()::text, 'item', '$PC_ITEM', 'R1', '1d4', 'damage', 0, '$TPL_R1');" >/dev/null
echo "CHAR=$CHAR PC_ITEM=$PC_ITEM"

echo "== admin adds R2 to template -> propagates to character item =="
TPL_R2=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL\",\"name\":\"R2\",\"diceFormula\":\"2d6\",\"rollType\":\"damage\",\"sortOrder\":1}" | jq -r .id)
echo "TPL_R2=$TPL_R2"
echo "Character item rolls (must include R2):"
psql "$DATABASE_URL" -c "SELECT name, dice_formula, from_template_roll_id FROM roll_entries WHERE owner_id='$PC_ITEM' ORDER BY sort_order;"

echo "== admin DELETES template -> all inherited rolls on PC item must be cleaned =="
curl -s -b "$ADMIN_JAR" -X DELETE "$BASE/admin/item-templates/$TPL" | jq
echo "Character item rolls AFTER template delete (must be empty):"
psql "$DATABASE_URL" -c "SELECT name, dice_formula, from_template_roll_id FROM roll_entries WHERE owner_id='$PC_ITEM' ORDER BY sort_order;"
echo "Character item.template_item_id AFTER delete (must be null):"
psql "$DATABASE_URL" -c "SELECT template_item_id FROM items WHERE id='$PC_ITEM';"

echo ""
echo "=========================================="
echo "== Multi-template add/remove idempotency =="
echo "=========================================="
TPL_A=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/item-templates" \
  -d '{"name":"IdemA","system":"aa-v2","itemType":"utility","rarity":"common"}' | jq -r .id)
TPL_B=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/item-templates" \
  -d '{"name":"IdemB","system":"aa-v2","itemType":"utility","rarity":"common"}' | jq -r .id)
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL_A\",\"name\":\"AR\",\"diceFormula\":\"1d4\",\"rollType\":\"damage\",\"sortOrder\":0}" >/dev/null
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL_B\",\"name\":\"BR\",\"diceFormula\":\"1d6\",\"rollType\":\"damage\",\"sortOrder\":0}" >/dev/null
ITEM=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/system-items" \
  -d '{"name":"IdemItem","system":"aa-v2","itemType":"utility","rarity":"common"}' | jq -r .id)

echo "-- PUT [A,B] x3 (idempotent): each call must yield exactly 2 inherited rolls --"
for i in 1 2 3; do
  curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/items/$ITEM/template-links" \
    -d "{\"templateIds\":[\"$TPL_A\",\"$TPL_B\"]}" >/dev/null
  COUNT=$(curl -s -b "$ADMIN_JAR" "$BASE/items/$ITEM/rolls" | jq '[.[] | select(.fromTemplateRollId != null)] | length')
  echo "iter $i: inherited rolls = $COUNT (expected 2)"
done

echo "-- PUT [A] : remove B, A's roll must persist (1 inherited) --"
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/items/$ITEM/template-links" \
  -d "{\"templateIds\":[\"$TPL_A\"]}" >/dev/null
COUNT=$(curl -s -b "$ADMIN_JAR" "$BASE/items/$ITEM/rolls" | jq '[.[] | select(.fromTemplateRollId != null)] | length')
echo "after remove B: inherited rolls = $COUNT (expected 1)"

echo "-- PUT [] : remove all --"
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/items/$ITEM/template-links" \
  -d '{"templateIds":[]}' >/dev/null
COUNT=$(curl -s -b "$ADMIN_JAR" "$BASE/items/$ITEM/rolls" | jq '[.[] | select(.fromTemplateRollId != null)] | length')
echo "after remove all: inherited rolls = $COUNT (expected 0)"
