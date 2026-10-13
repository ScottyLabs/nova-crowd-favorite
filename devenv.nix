{ inputs, ... }:
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

  processes.web.exec = "deno task dev --host 127.0.0.1";
}
