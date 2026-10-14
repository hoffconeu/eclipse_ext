# Read-only UI Automation feasibility probe. Never prints window titles or text.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$scope = [System.Windows.Automation.TreeScope]::Children
$condition = [System.Windows.Automation.Condition]::TrueCondition
$button = [System.Windows.Automation.ControlType]::Button
$known = @{}
$start = [DateTime]::UtcNow
$deadline = $start.AddSeconds(45)
$events = 0

function Get-TeamWindows {
    $windows = $root.FindAll($scope, $condition)
    for ($i = 0; $i -lt $windows.Count; $i++) {
        try {
            $window = $windows.Item($i)
            $pidValue = $window.Current.ProcessId
            $processName = (Get-Process -Id $pidValue -ErrorAction Stop).ProcessName
            if ($processName -match '^(ms-teams|msteams|teams)$') {
                $handle = $window.Current.NativeWindowHandle
                if ($handle -ne 0) {
                    [PSCustomObject]@{ Handle = $handle; Element = $window }
                }
            }
        } catch {
            # Windows can disappear while UI Automation enumerates them.
        }
    }
}

function Get-ButtonSignals($window) {
    $queue = [System.Collections.Queue]::new()
    $queue.Enqueue(@($window, 0))
    $visited = 0
    $buttons = 0
    $accept = $false
    $decline = $false
    $reply = $false
    while ($queue.Count -gt 0 -and $visited -lt 300) {
        $item = $queue.Dequeue()
        $element = $item[0]
        $depth = $item[1]
        $visited++
        try {
            if ($element.Current.ControlType -eq $button) {
                $buttons++
                $label = $element.Current.Name
                if ($label -match '(?i)^(annehmen|anruf annehmen|accept|answer)(\b|$)') { $accept = $true }
                if ($label -match '(?i)^(ablehnen|decline|reject)(\b|$)') { $decline = $true }
                if ($label -match '(?i)^(antworten|reply)(\b|$)') { $reply = $true }
            }
            if ($depth -lt 4) {
                $children = $element.FindAll($scope, $condition)
                for ($j = 0; $j -lt $children.Count; $j++) {
                    $queue.Enqueue(@($children.Item($j), $depth + 1))
                }
            }
        } catch {
            # A transient or protected UI element is not evidence of an event.
        }
    }
    return [PSCustomObject]@{ Buttons = $buttons; Accept = $accept; Decline = $decline; Reply = $reply }
}

try {
    foreach ($entry in @(Get-TeamWindows)) { $known[$entry.Handle] = $true }
    Write-Output 'PROBE started duration=45s'
    while ([DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 750
        foreach ($entry in @(Get-TeamWindows)) {
            if ($known.ContainsKey($entry.Handle)) { continue }
            $known[$entry.Handle] = $true
            $signals = Get-ButtonSignals $entry.Element
            $seconds = [int]([DateTime]::UtcNow - $start).TotalSeconds
            Write-Output ("WINDOW seconds={0} buttons={1} accept={2} decline={3} reply={4}" -f `
                $seconds, $signals.Buttons, $signals.Accept, $signals.Decline, $signals.Reply)
            $events++
            if ($events -ge 20) { break }
        }
        if ($events -ge 20) { break }
    }
    Write-Output ("PROBE finished windows={0}" -f $events)
} catch {
    Write-Output 'PROBE unavailable: Windows UI Automation could not be read.'
    exit 1
}
