{ inputs, lib, ... }:
{
  imports = [ inputs.scottylabs.devenvModules.default ];

  scottylabs = {
    enable = true;
    project.name = "nova-crowd-favorite";
    sqlite.enable = true;
    deno = {
      enable = true;
      svelte.enable = true;
    };
    kennel.services.web = { };
  };

  # Use the same locked checker as `deno task check` on every platform.
  git-hooks.hooks.svelte-check.entry = lib.mkForce "deno task check";

  processes.web.exec = "deno task dev --host 127.0.0.1";
}
