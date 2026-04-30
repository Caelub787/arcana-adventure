#!/bin/bash
# Regression test: per-instance override of inherited template rolls.
# Verifies that:
#  1. PATCHing an inherited roll auto-marks it isOverridden=true.
#  2. PATCHing the source template roll skips overridden copies but still
#     propagates to non-overridden copies.
#  3. DELETing the source template roll detaches overridden copies (preserved
#     as standalone) but deletes non-overridden copies.
#  4. Unlinking a template detaches overridden copies and deletes the rest.
#  5. POST /roll-entries/:id/reset-template restores values + clears flag.
set -e
BASE="http://localhost:5000/api"
TS=$(date +%s)
ADMIN_JAR=$(mktemp)
ADMIN_EMAIL="override_admin_${TS}@example.com"

curl -s -c "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/register" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"TestPass123!\",\"username\":\"adm$TS\",\"name\":\"A\"}" >/dev/null
psql "$DATABASE_URL" -c "UPDATE users SET is_admin = true WHERE email = '$ADMIN_EMAIL';" >/dev/null
> "$ADMIN_JAR"
curl -s -c "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/login" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"TestPass123!\"}" >/dev/null

echo "== 1. Setup: template TPL with R1 + R2, two items I1/I2 linked to TPL =="
TPL=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/item-templates" \
  -d '{"name":"OvrTpl","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
TPL_R1=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL\",\"name\":\"R1\",\"diceFormula\":\"1d4\",\"rollType\":\"damage\",\"sortOrder\":0}" | jq -r .id)
TPL_R2=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/roll-entries" \
  -d "{\"ownerType\":\"item\",\"ownerId\":\"$TPL\",\"name\":\"R2\",\"diceFormula\":\"1d6\",\"rollType\":\"damage\",\"sortOrder\":1}" | jq -r .id)
I1=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/system-items" \
  -d '{"name":"OvrItem1","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
I2=$(curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X POST "$BASE/admin/system-items" \
  -d '{"name":"OvrItem2","system":"aa-v2","itemType":"weapon","rarity":"common"}' | jq -r .id)
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/items/$I1/template-links" \
  -d "{\"templateIds\":[\"$TPL\"]}" >/dev/null
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/items/$I2/template-links" \
  -d "{\"templateIds\":[\"$TPL\"]}" >/dev/null
echo "TPL=$TPL R1=$TPL_R1 R2=$TPL_R2 I1=$I1 I2=$I2"

# Look up I1's inherited copy of R1
I1_R1=$(curl -s -b "$ADMIN_JAR" "$BASE/items/$I1/rolls" \
  | jq -r --arg src "$TPL_R1" '.[] | select(.fromTemplateRollId == $src) | .id')
I1_R2=$(curl -s -b "$ADMIN_JAR" "$BASE/items/$I1/rolls" \
  | jq -r --arg src "$TPL_R2" '.[] | select(.fromTemplateRollId == $src) | .id')
I2_R1=$(curl -s -b "$ADMIN_JAR" "$BASE/items/$I2/rolls" \
  | jq -r --arg src "$TPL_R1" '.[] | select(.fromTemplateRollId == $src) | .id')
echo "I1_R1=$I1_R1 I1_R2=$I1_R2 I2_R1=$I2_R1"

echo ""
echo "== 2. PATCH I1's inherited R1 -> isOverridden flips to true =="
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PATCH "$BASE/roll-entries/$I1_R1" \
  -d '{"diceFormula":"99d99"}' >/dev/null
psql "$DATABASE_URL" -c "SELECT name, dice_formula, is_overridden FROM roll_entries WHERE id='$I1_R1';"

echo ""
echo "== 3. PATCH template R1: I2 inherits new value, I1 (overridden) keeps custom =="
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PATCH "$BASE/roll-entries/$TPL_R1" \
  -d '{"diceFormula":"5d10"}' >/dev/null
echo "I1_R1 (overridden, expect 99d99):"
psql "$DATABASE_URL" -c "SELECT dice_formula, is_overridden FROM roll_entries WHERE id='$I1_R1';"
echo "I2_R1 (not overridden, expect 5d10):"
psql "$DATABASE_URL" -c "SELECT dice_formula, is_overridden FROM roll_entries WHERE id='$I2_R1';"

echo ""
echo "== 4. POST /roll-entries/:id/reset-template -> I1_R1 back to 5d10, override=false =="
curl -s -b "$ADMIN_JAR" -X POST "$BASE/roll-entries/$I1_R1/reset-template" >/dev/null
psql "$DATABASE_URL" -c "SELECT dice_formula, is_overridden FROM roll_entries WHERE id='$I1_R1';"

echo ""
echo "== 5. Re-override I1_R1, then DELETE template R1 -> I1_R1 detached (kept), I2_R1 gone =="
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PATCH "$BASE/roll-entries/$I1_R1" \
  -d '{"diceFormula":"7d7"}' >/dev/null
curl -s -b "$ADMIN_JAR" -X DELETE "$BASE/roll-entries/$TPL_R1" >/dev/null
echo "I1_R1 after template R1 delete (expect 7d7, from_template_roll_id=NULL, is_overridden=false):"
psql "$DATABASE_URL" -c "SELECT dice_formula, from_template_roll_id, is_overridden FROM roll_entries WHERE id='$I1_R1';"
echo "I2_R1 after template R1 delete (expect 0 rows):"
psql "$DATABASE_URL" -c "SELECT id FROM roll_entries WHERE id='$I2_R1';"

echo ""
echo "== 6. Override I1_R2, then UNLINK template -> I1_R2 detached, I2_R2 deleted =="
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PATCH "$BASE/roll-entries/$I1_R2" \
  -d '{"diceFormula":"3d3"}' >/dev/null
I2_R2=$(curl -s -b "$ADMIN_JAR" "$BASE/items/$I2/rolls" \
  | jq -r --arg src "$TPL_R2" '.[] | select(.fromTemplateRollId == $src) | .id')
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/items/$I1/template-links" \
  -d '{"templateIds":[]}' >/dev/null
curl -s -b "$ADMIN_JAR" -H "Content-Type: application/json" -X PUT "$BASE/items/$I2/template-links" \
  -d '{"templateIds":[]}' >/dev/null
echo "I1_R2 after unlink (expect 3d3, from_template_roll_id=NULL):"
psql "$DATABASE_URL" -c "SELECT dice_formula, from_template_roll_id, is_overridden FROM roll_entries WHERE id='$I1_R2';"
echo "I2_R2 after unlink (expect 0 rows):"
psql "$DATABASE_URL" -c "SELECT id FROM roll_entries WHERE id='$I2_R2';"

echo ""
echo "== Cleanup =="
curl -s -b "$ADMIN_JAR" -X DELETE "$BASE/admin/item-templates/$TPL" >/dev/null
curl -s -b "$ADMIN_JAR" -X DELETE "$BASE/admin/system-items/$I1" >/dev/null
curl -s -b "$ADMIN_JAR" -X DELETE "$BASE/admin/system-items/$I2" >/dev/null
echo "DONE"
