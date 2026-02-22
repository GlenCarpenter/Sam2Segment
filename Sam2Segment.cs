using SwarmUI.Core;
using SwarmUI.Media;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.Builtin_ComfyUIBackend;

// NOTE: Namespace must NOT contain "SwarmUI" (this is reserved for built-ins)
namespace Sam2Segment;

public partial class Sam2Segment : Extension
{
    public static T2IRegisteredParam<Image> Sam2PointImage;
    public static T2IRegisteredParam<string> Sam2PointCoordsPositive;
    public static T2IRegisteredParam<string> Sam2PointCoordsNegative;
    public static T2IRegisteredParam<string> Sam2BBox;

    public override void OnPreInit()
    {
        ScriptFiles.Add("Assets/sam2_points.js");
        ScriptFiles.Add("Assets/sam2_bbox.js");
        OtherAssets.Add("Assets/rectangle.png");
        OtherAssets.Add("Assets/crosshair.png");
    }

    public override void OnInit()
    {
        Sam2PointImage = T2IParamTypes.Register<Image>(new("SAM2 Point Image", "Internal: Base image used for SAM2 point masking.",
            null, FeatureFlag: "sam2", VisibleNormally: false, ExtraHidden: true, DoNotSave: true, DoNotPreview: true, AlwaysRetain: true
            ));
        Sam2PointCoordsPositive = T2IParamTypes.Register<string>(new("SAM2 Positive Points", "Internal: JSON list of positive point coordinates for SAM2 point masking.",
            "[]", FeatureFlag: "sam2", VisibleNormally: false, ExtraHidden: true, DoNotSave: true, DoNotPreview: true, AlwaysRetain: true
            ));
        Sam2PointCoordsNegative = T2IParamTypes.Register<string>(new("SAM2 Negative Points", "Internal: JSON list of negative point coordinates for SAM2 point masking.",
            "[]", FeatureFlag: "sam2", VisibleNormally: false, ExtraHidden: true, DoNotSave: true, DoNotPreview: true, AlwaysRetain: true
            ));
        Sam2BBox = T2IParamTypes.Register<string>(new("SAM2 BBox", "Internal: JSON bounding box [x1,y1,x2,y2] for SAM2 bbox masking.",
            null, FeatureFlag: "sam2", VisibleNormally: false, ExtraHidden: true, DoNotSave: true, DoNotPreview: true, AlwaysRetain: true
            ));
        ComfyUISelfStartBackend.CustomNodePaths.Add(FilePath + "ComfyNodes");
        WorkflowGeneratorSteps.AddStep(AddSam2PointMaskStep, 8.9);
        WorkflowGeneratorSteps.AddStep(AddSam2BBoxMaskStep, 8.85);
    }
}
