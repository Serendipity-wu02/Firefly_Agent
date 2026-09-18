$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node --experimental-strip-types "$ScriptDir\..\npm.mts" @args
