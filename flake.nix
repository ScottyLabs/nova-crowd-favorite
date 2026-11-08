{
  description = "Nova Crowd Favorite";

  nixConfig = {
    extra-substituters = [ "https://scottylabs.cachix.org" ];
    extra-trusted-public-keys = [
      "scottylabs.cachix.org-1:hajjEX5SLi/Y7yYloiXTt2IOr3towcTGRhMh1vu6Tjg="
    ];
  };

  inputs = {
    scottylabs.url = "git+https://git.cmu.dev/ScottyLabs/kennel";
    nixpkgs.follows = "scottylabs/nixpkgs";
    flake-parts.follows = "scottylabs/flake-parts";
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ inputs.scottylabs.flakeModules.default ];
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      perSystem =
        { lib, helpers, ... }:
        {
          scottylabs = {
            project.name = "nova-crowd-favorite";
            sqlite.enable = true;
            deno = {
              enable = true;
              svelte.enable = true;
            };

            processes.web.run = "exec secretspec run -P dev -- deno task dev --host 127.0.0.1";
          };

          services.web = {
            package = helpers.buildDenoTask {
              src = ./.;
              pname = "nova-crowd-favorite";
              inherit (lib.importJSON ./package.json) version;
              compile = true;
            };
            customDomain = "crowd-favorite.nova.scottylabs.org";
          };
        };
    };
}
