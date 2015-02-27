// Main page
//
exports.View =
{
    title: "{{{name}}}",
    elements:
    [
        { control: "stackpanel", orientation: "Horizontal", contents: [
            { control: "text", value: "Name:", fontsize: 12, width: 200, textAlignment: "Right", margin: { top: 10, right: 10 } },
            { control: "edit", fontsize: 12, width: 200, binding: "name" },
        ] },

        { control: "text", value: "Welcome to Synchro {name}", fontsize: 12 },
    ]
}

exports.InitializeViewModel = function(context, session)
{
    var viewModel =
    {
        name: ""
    }
    return viewModel;
}
