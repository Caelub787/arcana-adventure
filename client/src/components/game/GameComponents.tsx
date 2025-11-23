// 4. Campaign Menu (Replaces GMTools Sheet content and adds more)
interface CampaignMenuProps {
  role: Role;
  inviteCode?: string;
  inspectedChar?: Character;
  onInspectChar?: (char: Character | null) => void;
  gridSize: number;
  setGridSize: (size: number) => void;
}

export function CampaignMenu({ role, inviteCode, inspectedChar, onInspectChar, gridSize, setGridSize }: CampaignMenuProps) {
  // ... existing implementation ...
  // Mock Data for the menu
  const PLAYERS = [
    { name: "DungeonMaster99", role: "GM", status: "Online", avatar: "🧙‍♂️" },
    { name: "ValeriusUser", role: "Player", status: "Online", avatar: "🛡️" },
    // { name: "RogueShadow", role: "Player", status: "Offline", avatar: "🗡️" }, // Removed non-playing mock
  ];

  const CHARACTERS = [
    { name: "Valerius", class: "Warrior", level: 3, owner: "ValeriusUser" },
    { name: "Nyx", class: "Rogue", level: 2, owner: "RogueShadow" },
  ];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="bg-stone-900/80 border-stone-500/50 text-stone-100 hover:bg-stone-800 fixed top-4 right-4 z-50">
          <Settings className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-stone-950 border-l-stone-800 text-stone-200 w-full sm:max-w-md overflow-y-auto">
        <div className="mb-6">
          <h2 className="font-display text-2xl text-amber-500 mb-1">Campaign Settings</h2>
          <p className="text-xs text-stone-500">Manage adventure details</p>
        </div>
        
        {/* Invite Code Section */}
        <div className="mb-8 p-4 bg-stone-900/50 border border-stone-800 rounded-lg">
          <h3 className="text-xs font-bold text-stone-400 uppercase mb-2 flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-amber-500" /> Invite Code
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-xl text-amber-100 tracking-widest bg-black/30 p-2 rounded text-center border border-dashed border-stone-700 select-all">
              {inviteCode || "LOADING..."}
            </div>
            <Button size="sm" variant="ghost" className="h-10 w-10 p-0">
              <Scroll className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-stone-500 mt-2 text-center">Share this code with players to let them join.</p>
        </div>

        <Tabs defaultValue="players" className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-stone-900">
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="characters">Characters</TabsTrigger>
          </TabsList>
          
          <TabsContent value="players" className="mt-4 space-y-4">
            <h3 className="text-sm font-bold text-stone-400 uppercase mb-2">Campaign Roster</h3>
            <div className="space-y-2">
              {PLAYERS.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-stone-900 rounded border border-stone-800">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{p.avatar}</div>
                    <div>
                      <div className="font-bold text-stone-200">{p.name}</div>
                      <div className="text-xs text-stone-500">{p.role}</div>
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1 rounded ${p.status === 'Online' ? 'bg-green-900/20 text-green-400' : 'bg-stone-800 text-stone-600'}`}>
                    {p.status}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="characters" className="mt-4 space-y-4">
             <h3 className="text-sm font-bold text-stone-400 uppercase mb-2">Active Heroes</h3>
             <div className="space-y-2">
              {CHARACTERS.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-stone-900 rounded border border-stone-800">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-stone-800 rounded flex items-center justify-center border border-stone-700">
                      <Sword className="h-5 w-5 text-stone-500" />
                    </div>
                    <div>
                      <div className="font-bold text-stone-200">{c.name}</div>
                      <div className="text-xs text-stone-500">Lvl {c.level} {c.class}</div>
                    </div>
                  </div>
                  <div className="text-xs text-stone-600">
                    Played by <span className="text-stone-400">{c.owner}</span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* GM Only Section */}
        {role === 'gm' && (
          <div className="mt-8 border-t border-stone-800 pt-6">
            <h3 className="text-sm font-bold text-purple-400 uppercase mb-4">GM Tools</h3>
            
            {/* Grid Settings */}
            <div className="mb-4 p-3 bg-stone-900 border border-stone-800 rounded">
               <div className="flex justify-between mb-2">
                 <Label className="text-xs font-bold text-stone-400">Grid Size (1 Sq = 5ft)</Label>
                 <span className="text-xs text-amber-500">{gridSize}px</span>
               </div>
               <input 
                 type="range" 
                 min="30" 
                 max="100" 
                 value={gridSize} 
                 onChange={(e) => setGridSize(parseInt(e.target.value))}
                 className="w-full accent-amber-600"
               />
            </div>
            
            {inspectedChar && (
              <div className="mb-4 p-3 bg-purple-900/10 border border-purple-900/30 rounded">
                 <div className="flex justify-between items-center mb-2">
                   <span className="text-sm font-bold text-purple-200">Inspecting: {inspectedChar.name}</span>
                   <Button size="sm" variant="ghost" onClick={() => onInspectChar && onInspectChar(null)} className="h-6 w-6 p-0 hover:bg-purple-900/50">
                     <LogOut className="h-3 w-3" />
                   </Button>
                 </div>
                 <div className="text-xs text-stone-400">
                   Inventory: {inspectedChar.inventory.join(", ") || "Empty"}
                 </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" className="bg-stone-800 hover:bg-stone-700">
                <Plus className="mr-2 h-4 w-4" /> Add Token
              </Button>
              <Button variant="secondary" className="bg-stone-800 hover:bg-stone-700">
                <MapIcon className="mr-2 h-4 w-4" /> Change Map
              </Button>
            </div>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-stone-800">
          <Button variant="destructive" className="w-full bg-red-950/30 text-red-400 hover:bg-red-900/50 border border-red-900/50">
            <LogOut className="mr-2 h-4 w-4" /> Leave Campaign
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
