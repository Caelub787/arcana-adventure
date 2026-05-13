/**
 * Smoke-test mount for @arcana/library-dialogs.
 *
 * Demonstrates:
 *   1. Theming via a single CSS class (no JS theme prop).
 *   2. minimalHostAdapter wired to a partner OAuth bearer token.
 *   3. Item + Roll-Template dialogs rendered behind buttons.
 *
 * For partners: copy this file into your app, replace the token+baseUrl
 * config with your own (bring-your-own auth flow), and you're done.
 */
import * as React from "react";
import {
  ItemDialog, RollTemplateDialog, SpellDialog,
  CharacterDialog, CharacterTemplateDialog,
  SpeciesDialog, FeatTreeDialog,
  minimalHostAdapter, type HostAdapter,
} from "@arcana/library-dialogs";

export const App: React.FC = () => {
  const [baseUrl, setBaseUrl] = React.useState(
    () => localStorage.getItem("ld.baseUrl") || (typeof window !== "undefined" ? window.location.origin : ""),
  );
  const [token, setToken] = React.useState(
    () => localStorage.getItem("ld.token") || "",
  );
  React.useEffect(() => { localStorage.setItem("ld.baseUrl", baseUrl); }, [baseUrl]);
  React.useEffect(() => { localStorage.setItem("ld.token", token); }, [token]);

  const host: HostAdapter = React.useMemo(() => minimalHostAdapter({
    baseUrl, accessToken: token,
    notify: (level, msg) => {
      // Real partners would route to their toast system here.
      // For the smoke test we just dump to console + a banner.
      console.log(`[${level}] ${msg}`);
      const el = document.getElementById("ld-toast");
      if (el) {
        el.textContent = `[${level}] ${msg}`;
        el.style.display = "block";
        setTimeout(() => { el.style.display = "none"; }, 4000);
      }
    },
  }), [baseUrl, token]);

  const [showItem, setShowItem] = React.useState(false);
  const [showTemplate, setShowTemplate] = React.useState(false);
  const [showSpell, setShowSpell] = React.useState(false);
  const [showCharacter, setShowCharacter] = React.useState(false);
  const [showCharTemplate, setShowCharTemplate] = React.useState(false);
  const [showSpecies, setShowSpecies] = React.useState(false);
  const [showFeatTree, setShowFeatTree] = React.useState(false);

  return (
    <div className="cr-launcher" data-ld-root="" data-testid="canvasrealms-launcher">
      <h1>CanvasRealms × Arcana Library Dialogs</h1>
      <p>
        These dialogs are pulled directly from <code>@arcana/library-dialogs</code>.
        The CanvasRealms purple skin is one CSS block — no fork required.
      </p>

      <div className="config">
        <label>Arcana base URL</label>
        <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://your-arcana.example" />
        <label>OAuth bearer token (library:read library:write)</label>
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="paste a partner access token" />
      </div>

      <div className="row" style={{ marginTop: 20 }}>
        <button onClick={() => setShowItem(true)} data-testid="button-open-item">Create Item</button>
        <button onClick={() => setShowTemplate(true)} data-testid="button-open-template">Create Roll Template</button>
        <button onClick={() => setShowSpell(true)} data-testid="button-open-spell">Create Spell</button>
        <button onClick={() => setShowCharacter(true)} data-testid="button-open-character">Create Character</button>
        <button onClick={() => setShowCharTemplate(true)} data-testid="button-open-character-template">Create Character Template</button>
        <button onClick={() => setShowSpecies(true)} data-testid="button-open-species">Create Species</button>
        <button onClick={() => setShowFeatTree(true)} data-testid="button-open-feat-tree">Create Feat Tree</button>
      </div>

      <div id="ld-toast" style={{
        display: "none", marginTop: 16, padding: "10px 14px", borderRadius: 8,
        background: "#2a1a44", border: "1px solid #5a2f88", fontFamily: "ui-monospace, monospace",
      }} />

      {/*
        IMPORTANT: dialogs rely on [data-ld-root] being on or above them
        for theme variables to apply. The DefaultModal sets it on its
        overlay automatically — partners using their own modal slot must
        ensure this attribute exists.
      */}
      <div className="cr-skin" data-ld-root="">
        <ItemDialog
          open={showItem}
          onOpenChange={setShowItem}
          host={host}
          campaignSystem="aa-v2"
          onSaved={(saved) => console.log("Saved item:", saved)}
        />
        <RollTemplateDialog
          open={showTemplate}
          onOpenChange={setShowTemplate}
          host={host}
          campaignSystem="aa-v2"
          onSaved={(saved) => console.log("Saved roll template:", saved)}
        />
        <SpellDialog
          open={showSpell}
          onOpenChange={setShowSpell}
          host={host}
          campaignSystem="aa-v2"
          onSaved={(saved) => console.log("Saved spell:", saved)}
        />
        <CharacterDialog
          open={showCharacter}
          onOpenChange={setShowCharacter}
          host={host}
          campaignSystem="aa-v2"
          onSaved={(saved) => console.log("Saved character:", saved)}
        />
        <CharacterTemplateDialog
          open={showCharTemplate}
          onOpenChange={setShowCharTemplate}
          host={host}
          campaignSystem="aa-v2"
          onSaved={(saved) => console.log("Saved character template:", saved)}
        />
        <SpeciesDialog
          open={showSpecies}
          onOpenChange={setShowSpecies}
          host={host}
          campaignSystem="aa-v2"
          onSaved={(saved) => console.log("Saved species:", saved)}
        />
        <FeatTreeDialog
          open={showFeatTree}
          onOpenChange={setShowFeatTree}
          host={host}
          campaignSystem="aa-v2"
          onSaved={(saved) => console.log("Saved feat tree:", saved)}
        />
      </div>
    </div>
  );
};
