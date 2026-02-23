using Newtonsoft.Json.Linq;
using SwarmUI.Builtin_ComfyUIBackend;
using SwarmUI.Utils;
namespace Sam2Segment;

public partial class Sam2Segment
{
    private static void AddSam2PointMaskStep(WorkflowGenerator g)
    {
        if (!g.UserInput.TryGet(Sam2PointCoordsPositive, out string coords) || string.IsNullOrWhiteSpace(coords) || coords == "[]")
        {
            return;
        }
        string negCoords = null;
        if (g.UserInput.TryGet(Sam2PointCoordsNegative, out string negCoordsRaw) && !string.IsNullOrWhiteSpace(negCoordsRaw) && negCoordsRaw != "[]")
        {
            negCoords = negCoordsRaw;
        }
        JArray imageNodeActual = null;
        if (g.UserInput.TryGet(Sam2PointImage, out Image img))
        {
            string imageNode = g.CreateLoadImageNode(img, "${sampointimage}", true);
            imageNodeActual = [imageNode, 0];
        }
        else if (g.FinalInputImage is not null)
        {
            imageNodeActual = g.FinalInputImage;
        }
        if (imageNodeActual is null)
        {
            return;
        }
        string modelNode = g.CreateNode("DownloadAndLoadSAM2Model", new JObject()
        {
            ["model"] = "sam2_hiera_base_plus.safetensors",
            ["segmentor"] = "single_image",
            ["device"] = "cuda",
            ["precision"] = "bf16"
        });
        JObject segInputs = new()
        {
            ["sam2_model"] = new JArray() { modelNode, 0 },
            ["image"] = imageNodeActual,
            ["keep_model_loaded"] = true,
            ["coordinates_positive"] = coords
        };
        if (negCoords is not null)
        {
            segInputs["coordinates_negative"] = negCoords;
        }
        string segNode = g.CreateNode("Sam2Segmentation", segInputs);
        string maskNode = g.CreateNode("MaskToImage", new JObject()
        {
            ["mask"] = new JArray() { segNode, 0 }
        });
        g.FinalImageOut = [maskNode, 0];
        g.CreateImageSaveNode(g.FinalImageOut, "9");
        g.SkipFurtherSteps = true;
    }
}
