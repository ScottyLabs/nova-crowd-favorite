{
  description = "Nova Crowd Favorite";

  nixConfig = {
    extra-substituters = [ "https://scottylabs.cachix.org" ];
    extra-trusted-public-keys = [
      "scottylabs.cachix.org-1:hajjEX5SLi/Y7yYloiXTt2IOr3towcTGRhMh1vu6Tjg="
    ];
  };

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    scottylabs = {
      url = "git+https://git.cmu.dev/ScottyLabs/kennel";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, scottylabs, ... }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [
        "x86_64-linux"
        "aarch64-linux"
      ];
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          lib = scottylabs.mkLib pkgs;
          web = lib.buildDenoTask {
            src = ./.;
            pname = "nova-crowd-favorite";
            inherit (builtins.fromJSON (builtins.readFile ./package.json)) version;
            compile = true;
          };
        in
        {
          inherit web;
          default = web;
        }
      );
    };
}
