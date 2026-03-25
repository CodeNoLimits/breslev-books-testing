#!/bin/bash
# ================================================================
# WATCH AGENTS — Coordination autonome Breslev by Esther Ifrah
# Surveille COORDINATION-AGENTS.md toutes les 60 secondes.
# Si le fichier a été modifié par un autre agent → affiche un résumé.
#
# Usage: ./watch-agents.sh
# Arrêter: Ctrl+C
# ================================================================

COORD_FILE="$(dirname "$0")/COORDINATION-AGENTS.md"
POLL_INTERVAL=60
AGENT_NAME="${AGENT_NAME:-Claude Code}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║  🔄 WATCH AGENTS — Breslev Coordination       ║${RESET}"
echo -e "${BOLD}${CYAN}║  Agent: ${AGENT_NAME:-Claude Code}$(printf '%*s' $((30-${#AGENT_NAME})) '')║${RESET}"
echo -e "${BOLD}${CYAN}║  Poll: toutes les ${POLL_INTERVAL}s                       ║${RESET}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════╝${RESET}"
echo ""

# Dernière date de modification connue
LAST_MOD=$(stat -f "%m" "$COORD_FILE" 2>/dev/null || date +%s)

echo -e "${GREEN}✅ Surveillance démarrée. Ctrl+C pour arrêter.${RESET}"
echo -e "${BLUE}📄 Fichier surveillé: $COORD_FILE${RESET}"
echo ""

while true; do
    CURRENT_MOD=$(stat -f "%m" "$COORD_FILE" 2>/dev/null)

    if [ "$CURRENT_MOD" != "$LAST_MOD" ]; then
        echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
        echo -e "${YELLOW}⚡ MISE À JOUR DÉTECTÉE — $(date '+%H:%M:%S')${RESET}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

        # Afficher les tâches EN COURS et les nouvelles entrées INBOX
        echo -e "\n${CYAN}📬 INBOX pour ${AGENT_NAME}:${RESET}"

        # Extraire section INBOX de l'agent
        if [ "$AGENT_NAME" = "Claude Code" ]; then
            awk '/### 📥 Pour Claude Code/,/### 📥 Pour/' "$COORD_FILE" | grep -v "### 📥 Pour Antigravity" | grep -v "### 📥 Pour Co-Work" | tail -n +2 | head -10
        elif [ "$AGENT_NAME" = "Antigravity" ]; then
            awk '/### 📥 Pour Antigravity/,/### 📥 Pour/' "$COORD_FILE" | grep -v "### 📥 Pour Claude Code" | grep -v "### 📥 Pour Co-Work" | tail -n +2 | head -10
        elif [ "$AGENT_NAME" = "Co-Work" ]; then
            awk '/### 📥 Pour Co-Work/,/---/' "$COORD_FILE" | tail -n +2 | head -10
        fi

        echo -e "\n${CYAN}🎯 TÂCHES À FAIRE (non assignées):${RESET}"
        grep "À FAIRE" "$COORD_FILE" | head -5

        echo ""
        LAST_MOD="$CURRENT_MOD"

        # Notification macOS (si disponible)
        which osascript >/dev/null 2>&1 && osascript -e "display notification \"Mise à jour COORDINATION-AGENTS.md détectée\" with title \"Watch Agents Breslev\" subtitle \"$(date '+%H:%M:%S')\"" 2>/dev/null
    else
        # Affichage discret toutes les 60s
        printf "\r${BLUE}[$(date '+%H:%M:%S')] Surveillance active... (prochaine vérification dans ${POLL_INTERVAL}s)${RESET}"
    fi

    sleep "$POLL_INTERVAL"
done
